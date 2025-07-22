
-- Phase 1: Database Structure Setup

-- Recreate journal entries table (optimized version)
CREATE TABLE public.journal_entries (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id UUID NOT NULL,
  entry_date DATE NOT NULL,
  month INTEGER NOT NULL,
  year INTEGER NOT NULL,
  entry_type TEXT NOT NULL CHECK (entry_type IN ('depreciation', 'disposition', 'acquisition')),
  description TEXT NOT NULL,
  total_amount NUMERIC NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'posted' CHECK (status IN ('draft', 'posted')),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(company_id, month, year, entry_type)
);

-- Recreate journal lines table
CREATE TABLE public.journal_lines (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  journal_entry_id UUID NOT NULL REFERENCES public.journal_entries(id) ON DELETE CASCADE,
  cow_id TEXT,
  account_code TEXT NOT NULL,
  account_name TEXT NOT NULL,
  description TEXT NOT NULL,
  debit_amount NUMERIC NOT NULL DEFAULT 0,
  credit_amount NUMERIC NOT NULL DEFAULT 0,
  line_type TEXT NOT NULL CHECK (line_type IN ('debit', 'credit')),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create monthly processing tracking table
CREATE TABLE public.monthly_processing_log (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id UUID NOT NULL,
  processing_month INTEGER NOT NULL,
  processing_year INTEGER NOT NULL,
  entry_type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
  cows_processed INTEGER DEFAULT 0,
  total_amount NUMERIC DEFAULT 0,
  error_message TEXT,
  started_at TIMESTAMP WITH TIME ZONE,
  completed_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(company_id, processing_month, processing_year, entry_type)
);

-- Enable RLS on all tables
ALTER TABLE public.journal_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.journal_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.monthly_processing_log ENABLE ROW LEVEL SECURITY;

-- Create RLS policies
CREATE POLICY "Users can access journal entries from their company" 
ON public.journal_entries FOR ALL 
USING (company_id IN (
  SELECT company_memberships.company_id
  FROM company_memberships
  WHERE company_memberships.user_id = auth.uid()
));

CREATE POLICY "Users can access journal lines through their company journal entries" 
ON public.journal_lines FOR ALL 
USING (journal_entry_id IN (
  SELECT id FROM public.journal_entries 
  WHERE company_id IN (
    SELECT company_memberships.company_id
    FROM company_memberships
    WHERE company_memberships.user_id = auth.uid()
  )
));

CREATE POLICY "Users can access processing logs from their company" 
ON public.monthly_processing_log FOR ALL 
USING (company_id IN (
  SELECT company_memberships.company_id
  FROM company_memberships
  WHERE company_memberships.user_id = auth.uid()
));

-- Create indexes for performance
CREATE INDEX idx_journal_entries_company_date ON public.journal_entries(company_id, entry_date);
CREATE INDEX idx_journal_entries_company_month_year ON public.journal_entries(company_id, month, year);
CREATE INDEX idx_journal_lines_journal_entry ON public.journal_lines(journal_entry_id);
CREATE INDEX idx_journal_lines_cow_id ON public.journal_lines(cow_id);
CREATE INDEX idx_monthly_processing_log_company ON public.monthly_processing_log(company_id);
CREATE INDEX idx_monthly_processing_log_status ON public.monthly_processing_log(status);

-- Add trigger for updating timestamps
CREATE TRIGGER update_journal_entries_updated_at
BEFORE UPDATE ON public.journal_entries
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Phase 2: Core Processing Functions

-- Function to calculate monthly depreciation for a single cow
CREATE OR REPLACE FUNCTION calculate_cow_monthly_depreciation(
  p_purchase_price NUMERIC,
  p_salvage_value NUMERIC,
  p_freshen_date DATE,
  p_target_date DATE
) RETURNS NUMERIC
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  monthly_depreciation NUMERIC;
  months_elapsed INTEGER;
  max_depreciation NUMERIC;
  total_depreciation NUMERIC;
BEGIN
  -- Calculate monthly straight-line depreciation (5 years)
  monthly_depreciation := (p_purchase_price - p_salvage_value) / (5 * 12);
  
  -- Calculate months elapsed from freshen date to target date
  months_elapsed := (EXTRACT(YEAR FROM p_target_date) - EXTRACT(YEAR FROM p_freshen_date)) * 12 + 
                   (EXTRACT(MONTH FROM p_target_date) - EXTRACT(MONTH FROM p_freshen_date));
  
  -- Ensure months_elapsed is not negative
  months_elapsed := GREATEST(0, months_elapsed);
  
  -- Calculate total depreciation but don't exceed depreciable amount
  max_depreciation := p_purchase_price - p_salvage_value;
  total_depreciation := LEAST(monthly_depreciation * months_elapsed, max_depreciation);
  
  -- Return monthly depreciation for this specific month
  RETURN CASE 
    WHEN total_depreciation >= max_depreciation THEN 0 -- Already fully depreciated
    ELSE monthly_depreciation
  END;
END;
$$;

-- Function to process monthly depreciation for a company
CREATE OR REPLACE FUNCTION process_monthly_depreciation(
  p_company_id UUID,
  p_target_month INTEGER,
  p_target_year INTEGER
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  cow_record RECORD;
  total_monthly_depreciation NUMERIC := 0;
  cows_processed INTEGER := 0;
  journal_entry_id UUID;
  target_date DATE;
  processing_log_id UUID;
  result JSONB;
BEGIN
  -- Calculate target date (last day of target month)
  target_date := (p_target_year || '-' || p_target_month || '-01')::DATE + INTERVAL '1 month - 1 day';
  
  -- Create processing log entry
  INSERT INTO public.monthly_processing_log (
    company_id, processing_month, processing_year, entry_type, status, started_at
  ) VALUES (
    p_company_id, p_target_month, p_target_year, 'depreciation', 'processing', now()
  ) 
  ON CONFLICT (company_id, processing_month, processing_year, entry_type)
  DO UPDATE SET status = 'processing', started_at = now(), error_message = NULL
  RETURNING id INTO processing_log_id;
  
  -- Check if journal entry already exists
  SELECT id INTO journal_entry_id 
  FROM public.journal_entries 
  WHERE company_id = p_company_id 
    AND month = p_target_month 
    AND year = p_target_year 
    AND entry_type = 'depreciation';
  
  -- If entry exists, delete it and its lines to recreate
  IF journal_entry_id IS NOT NULL THEN
    DELETE FROM public.journal_lines WHERE journal_entry_id = journal_entry_id;
    DELETE FROM public.journal_entries WHERE id = journal_entry_id;
  END IF;
  
  -- Process each active cow for the company
  FOR cow_record IN 
    SELECT id, tag_number, purchase_price, salvage_value, freshen_date
    FROM cows 
    WHERE company_id = p_company_id 
      AND status = 'active'
      AND freshen_date <= target_date
  LOOP
    DECLARE
      monthly_depreciation NUMERIC;
    BEGIN
      -- Calculate monthly depreciation for this cow
      monthly_depreciation := calculate_cow_monthly_depreciation(
        cow_record.purchase_price,
        cow_record.salvage_value,
        cow_record.freshen_date,
        target_date
      );
      
      -- Add to total if there's depreciation
      IF monthly_depreciation > 0 THEN
        total_monthly_depreciation := total_monthly_depreciation + monthly_depreciation;
        cows_processed := cows_processed + 1;
      END IF;
    END;
  END LOOP;
  
  -- Create journal entry if there's depreciation to record
  IF total_monthly_depreciation > 0 THEN
    INSERT INTO public.journal_entries (
      company_id, entry_date, month, year, entry_type, description, total_amount
    ) VALUES (
      p_company_id,
      target_date,
      p_target_month,
      p_target_year,
      'depreciation',
      'Monthly Depreciation - ' || TO_CHAR(target_date, 'Month YYYY'),
      total_monthly_depreciation
    ) RETURNING id INTO journal_entry_id;
    
    -- Create journal lines
    INSERT INTO public.journal_lines (
      journal_entry_id, account_code, account_name, description, debit_amount, credit_amount, line_type
    ) VALUES 
    (journal_entry_id, '6100', 'Depreciation Expense', 'Monthly dairy cow depreciation', total_monthly_depreciation, 0, 'debit'),
    (journal_entry_id, '1500.1', 'Accumulated Depreciation - Dairy Cows', 'Monthly dairy cow depreciation', 0, total_monthly_depreciation, 'credit');
  END IF;
  
  -- Update processing log
  UPDATE public.monthly_processing_log 
  SET status = 'completed', 
      cows_processed = cows_processed, 
      total_amount = total_monthly_depreciation,
      completed_at = now()
  WHERE id = processing_log_id;
  
  -- Return result
  result := jsonb_build_object(
    'success', true,
    'cows_processed', cows_processed,
    'total_amount', total_monthly_depreciation,
    'journal_entry_id', journal_entry_id
  );
  
  RETURN result;
  
EXCEPTION WHEN OTHERS THEN
  -- Update processing log with error
  UPDATE public.monthly_processing_log 
  SET status = 'failed', 
      error_message = SQLERRM,
      completed_at = now()
  WHERE id = processing_log_id;
  
  -- Return error result
  RETURN jsonb_build_object(
    'success', false,
    'error', SQLERRM
  );
END;
$$;

-- Function to process historical depreciation for a company
CREATE OR REPLACE FUNCTION process_historical_depreciation(
  p_company_id UUID,
  p_start_year INTEGER DEFAULT NULL,
  p_end_year INTEGER DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  start_year INTEGER;
  end_year INTEGER;
  current_year INTEGER;
  current_month INTEGER;
  earliest_freshen_date DATE;
  result JSONB;
  monthly_result JSONB;
  total_processed INTEGER := 0;
  total_amount NUMERIC := 0;
BEGIN
  -- Get the earliest freshen date for the company if no start year provided
  SELECT MIN(freshen_date) INTO earliest_freshen_date
  FROM cows 
  WHERE company_id = p_company_id;
  
  -- Set default start year to earliest freshen year
  start_year := COALESCE(p_start_year, EXTRACT(YEAR FROM earliest_freshen_date)::INTEGER);
  end_year := COALESCE(p_end_year, EXTRACT(YEAR FROM CURRENT_DATE)::INTEGER);
  
  -- Process each year and month
  FOR current_year IN start_year..end_year LOOP
    FOR current_month IN 1..12 LOOP
      -- Don't process future months
      IF (current_year || '-' || LPAD(current_month::TEXT, 2, '0') || '-01')::DATE <= CURRENT_DATE THEN
        -- Process this month
        SELECT process_monthly_depreciation(p_company_id, current_month, current_year) INTO monthly_result;
        
        -- Accumulate results
        IF (monthly_result->>'success')::BOOLEAN THEN
          total_processed := total_processed + (monthly_result->>'cows_processed')::INTEGER;
          total_amount := total_amount + (monthly_result->>'total_amount')::NUMERIC;
        END IF;
        
        -- Add small delay to prevent overwhelming the system
        PERFORM pg_sleep(0.1);
      END IF;
    END LOOP;
  END LOOP;
  
  RETURN jsonb_build_object(
    'success', true,
    'years_processed', end_year - start_year + 1,
    'total_entries_processed', total_processed,
    'total_amount', total_amount
  );
  
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object(
    'success', false,
    'error', SQLERRM
  );
END;
$$;

-- Function for automated monthly processing (called by cron)
CREATE OR REPLACE FUNCTION automated_monthly_processing()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  company_record RECORD;
  current_month INTEGER;
  current_year INTEGER;
  processing_day INTEGER;
  company_processing_day INTEGER;
  result JSONB;
  total_companies INTEGER := 0;
  successful_companies INTEGER := 0;
BEGIN
  -- Get current month and year
  current_month := EXTRACT(MONTH FROM CURRENT_DATE);
  current_year := EXTRACT(YEAR FROM CURRENT_DATE);
  processing_day := EXTRACT(DAY FROM CURRENT_DATE);
  
  -- Process each company that should be processed today
  FOR company_record IN 
    SELECT c.id, c.name, COALESCE(ds.journal_processing_day, 5) as journal_processing_day
    FROM companies c
    LEFT JOIN depreciation_settings ds ON ds.company_id = c.id
  LOOP
    company_processing_day := company_record.journal_processing_day;
    
    -- Only process if today is the company's processing day
    IF processing_day = company_processing_day THEN
      total_companies := total_companies + 1;
      
      -- Process depreciation for the previous month
      SELECT process_monthly_depreciation(
        company_record.id, 
        CASE WHEN current_month = 1 THEN 12 ELSE current_month - 1 END,
        CASE WHEN current_month = 1 THEN current_year - 1 ELSE current_year END
      ) INTO result;
      
      IF (result->>'success')::BOOLEAN THEN
        successful_companies := successful_companies + 1;
      END IF;
      
      -- Small delay between companies
      PERFORM pg_sleep(0.5);
    END IF;
  END LOOP;
  
  RETURN jsonb_build_object(
    'success', true,
    'total_companies', total_companies,
    'successful_companies', successful_companies,
    'processing_date', CURRENT_DATE
  );
  
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object(
    'success', false,
    'error', SQLERRM
  );
END;
$$;

-- Update the existing cron job to use our new function
SELECT cron.unschedule('monthly-journal-processing');

SELECT cron.schedule(
  'automated-monthly-processing',
  '0 6 * * *', -- Run daily at 6 AM UTC (companies will be filtered by their processing day)
  $$
  SELECT automated_monthly_processing();
  $$
);
