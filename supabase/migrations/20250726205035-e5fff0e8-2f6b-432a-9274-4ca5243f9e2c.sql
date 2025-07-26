-- Create function to handle reinstatement catch-up depreciation
-- Posts all missing depreciation periods to the current posting period
CREATE OR REPLACE FUNCTION public.process_reinstatement_catchup_depreciation(
  p_cow_id text,
  p_disposition_date date,
  p_reinstatement_date date DEFAULT CURRENT_DATE
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  cow_record RECORD;
  current_month INTEGER;
  current_year INTEGER;
  missing_periods RECORD;
  total_catchup_amount NUMERIC := 0;
  monthly_depreciation_rate NUMERIC;
  period_amount NUMERIC;
  journal_entry_id UUID;
  catchup_description TEXT;
BEGIN
  -- Get current posting period
  current_month := EXTRACT(MONTH FROM p_reinstatement_date);
  current_year := EXTRACT(YEAR FROM p_reinstatement_date);
  
  -- Get cow details
  SELECT c.id, c.tag_number, c.purchase_price, c.salvage_value, c.freshen_date, c.company_id
  INTO cow_record
  FROM public.cows c
  WHERE c.id = p_cow_id;
  
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Cow not found');
  END IF;
  
  -- Calculate monthly depreciation rate
  monthly_depreciation_rate := ROUND((cow_record.purchase_price - cow_record.salvage_value) / (5 * 12), 2);
  
  -- Calculate catch-up periods and amounts
  FOR missing_periods IN 
    WITH RECURSIVE date_series AS (
      -- Start from the day after disposition
      SELECT (p_disposition_date + INTERVAL '1 day')::date as period_start
      
      UNION ALL
      
      -- Generate monthly periods until current date
      SELECT 
        CASE 
          WHEN EXTRACT(DAY FROM period_start) = 1 THEN 
            -- If we're at the start of a month, move to next month
            DATE_TRUNC('month', period_start + INTERVAL '1 month')::date
          ELSE 
            -- If we're mid-month, move to start of next month
            DATE_TRUNC('month', period_start + INTERVAL '1 month')::date
        END
      FROM date_series
      WHERE period_start < p_reinstatement_date
    ),
    depreciation_periods AS (
      SELECT 
        period_start,
        CASE 
          WHEN period_start = (p_disposition_date + INTERVAL '1 day')::date AND 
               EXTRACT(DAY FROM p_disposition_date) > 1 THEN
            -- Partial month from disposition date to end of month
            EXTRACT(DAY FROM (DATE_TRUNC('month', p_disposition_date) + INTERVAL '1 month - 1 day')) - 
            EXTRACT(DAY FROM p_disposition_date)
          WHEN DATE_TRUNC('month', period_start) = DATE_TRUNC('month', p_reinstatement_date) THEN
            -- Partial month from start of month to reinstatement date
            EXTRACT(DAY FROM p_reinstatement_date)
          ELSE
            -- Full month
            EXTRACT(DAY FROM (DATE_TRUNC('month', period_start) + INTERVAL '1 month - 1 day'))
        END as days_in_period,
        CASE 
          WHEN period_start = (p_disposition_date + INTERVAL '1 day')::date AND 
               EXTRACT(DAY FROM p_disposition_date) > 1 THEN
            EXTRACT(DAY FROM (DATE_TRUNC('month', p_disposition_date) + INTERVAL '1 month - 1 day'))
          WHEN DATE_TRUNC('month', period_start) = DATE_TRUNC('month', p_reinstatement_date) THEN
            EXTRACT(DAY FROM (DATE_TRUNC('month', p_reinstatement_date) + INTERVAL '1 month - 1 day'))
          ELSE
            EXTRACT(DAY FROM (DATE_TRUNC('month', period_start) + INTERVAL '1 month - 1 day'))
        END as days_in_month,
        EXTRACT(MONTH FROM period_start) as period_month,
        EXTRACT(YEAR FROM period_start) as period_year
      FROM date_series
      WHERE period_start <= p_reinstatement_date
    )
    SELECT 
      period_month,
      period_year,
      days_in_period,
      days_in_month,
      ROUND(monthly_depreciation_rate * days_in_period / days_in_month, 2) as period_depreciation
    FROM depreciation_periods
    WHERE days_in_period > 0
  LOOP
    -- Check if depreciation already exists for this period
    IF NOT EXISTS (
      SELECT 1 
      FROM public.journal_lines jl
      JOIN public.journal_entries je ON je.id = jl.journal_entry_id
      WHERE jl.cow_id = p_cow_id
        AND je.entry_type = 'depreciation'
        AND je.month = missing_periods.period_month
        AND je.year = missing_periods.period_year
        AND jl.account_code = '1500.1'
        AND jl.line_type = 'credit'
    ) THEN
      total_catchup_amount := total_catchup_amount + missing_periods.period_depreciation;
    END IF;
  END LOOP;
  
  -- Create catch-up journal entry if there's missing depreciation
  IF total_catchup_amount > 0 THEN
    -- Build description of catch-up periods
    catchup_description := 'Reinstatement catch-up depreciation - Cow #' || cow_record.tag_number || 
                          ' (from ' || TO_CHAR(p_disposition_date + INTERVAL '1 day', 'Mon DD, YYYY') || 
                          ' to ' || TO_CHAR(p_reinstatement_date, 'Mon DD, YYYY') || ')';
    
    -- Create journal entry
    INSERT INTO public.journal_entries (
      company_id, entry_date, month, year, entry_type, description, total_amount
    ) VALUES (
      cow_record.company_id,
      p_reinstatement_date,
      current_month,
      current_year,
      'depreciation',
      catchup_description,
      total_catchup_amount
    ) RETURNING id INTO journal_entry_id;
    
    -- Create debit line for depreciation expense
    INSERT INTO public.journal_lines (
      journal_entry_id, account_code, account_name, description, debit_amount, credit_amount, line_type, cow_id
    ) VALUES (
      journal_entry_id, 
      '6100', 
      'Depreciation Expense', 
      catchup_description, 
      total_catchup_amount, 
      0, 
      'debit',
      p_cow_id
    );
    
    -- Create credit line for accumulated depreciation
    INSERT INTO public.journal_lines (
      journal_entry_id, account_code, account_name, description, debit_amount, credit_amount, line_type, cow_id
    ) VALUES (
      journal_entry_id, 
      '1500.1', 
      'Accumulated Depreciation - Dairy Cows', 
      catchup_description, 
      0, 
      total_catchup_amount, 
      'credit',
      p_cow_id
    );
    
    -- Update cow totals
    UPDATE public.cows
    SET 
      total_depreciation = (
        SELECT COALESCE(SUM(jl.credit_amount), 0)
        FROM public.journal_lines jl
        JOIN public.journal_entries je ON je.id = jl.journal_entry_id
        WHERE jl.cow_id = p_cow_id
          AND jl.account_code = '1500.1'
          AND jl.line_type = 'credit'
          AND je.entry_type = 'depreciation'
      ),
      current_value = purchase_price - (
        SELECT COALESCE(SUM(jl.credit_amount), 0)
        FROM public.journal_lines jl
        JOIN public.journal_entries je ON je.id = jl.journal_entry_id
        WHERE jl.cow_id = p_cow_id
          AND jl.account_code = '1500.1'
          AND jl.line_type = 'credit'
          AND je.entry_type = 'depreciation'
      ),
      updated_at = now()
    WHERE id = p_cow_id;
  END IF;
  
  RETURN jsonb_build_object(
    'success', true,
    'cow_id', p_cow_id,
    'catchup_amount', total_catchup_amount,
    'posted_to_period', current_month || '/' || current_year,
    'journal_entry_id', journal_entry_id,
    'disposition_date', p_disposition_date,
    'reinstatement_date', p_reinstatement_date
  );
  
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object(
    'success', false,
    'error', SQLERRM
  );
END;
$$;