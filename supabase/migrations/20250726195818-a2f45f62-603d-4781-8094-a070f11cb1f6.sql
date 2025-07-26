-- Fix monthly depreciation to exclude cows disposed during the month
-- This prevents depreciation from being calculated for cows after their disposition date

CREATE OR REPLACE FUNCTION public.process_monthly_depreciation_with_mode(
  p_company_id uuid, 
  p_target_month integer, 
  p_target_year integer, 
  p_processing_mode text DEFAULT 'historical'::text, 
  p_current_month integer DEFAULT NULL::integer, 
  p_current_year integer DEFAULT NULL::integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  cow_record RECORD;
  total_monthly_depreciation NUMERIC := 0;
  cows_processed_count INTEGER := 0;
  journal_entry_id UUID;
  target_date DATE;
  processing_log_id UUID;
  result JSONB;
  journal_month INTEGER;
  journal_year INTEGER;
  journal_date DATE;
  first_of_month DATE;
BEGIN
  -- Calculate target date (last day of target month)
  target_date := (p_target_year || '-' || p_target_month || '-01')::DATE + INTERVAL '1 month - 1 day';
  first_of_month := (p_target_year || '-' || p_target_month || '-01')::DATE;
  
  -- Determine which month/year to post the journal entry to
  IF p_processing_mode = 'production' AND p_current_month IS NOT NULL AND p_current_year IS NOT NULL THEN
    -- Production mode: post to current period
    journal_month := p_current_month;
    journal_year := p_current_year;
    journal_date := (p_current_year || '-' || p_current_month || '-01')::DATE + INTERVAL '1 month - 1 day';
  ELSE
    -- Historical mode: post to the actual depreciation period
    journal_month := p_target_month;
    journal_year := p_target_year;
    journal_date := target_date;
  END IF;
  
  -- Create processing log entry
  INSERT INTO public.monthly_processing_log (
    company_id, processing_month, processing_year, entry_type, status, started_at
  ) VALUES (
    p_company_id, p_target_month, p_target_year, 'depreciation', 'processing', now()
  ) 
  ON CONFLICT (company_id, processing_month, processing_year, entry_type)
  DO UPDATE SET status = 'processing', started_at = now(), error_message = NULL
  RETURNING id INTO processing_log_id;
  
  -- Check if journal entry already exists for the posting period
  SELECT id INTO journal_entry_id 
  FROM public.journal_entries 
  WHERE company_id = p_company_id 
    AND month = journal_month 
    AND year = journal_year 
    AND entry_type = 'depreciation'
    AND description LIKE '%' || TO_CHAR(target_date, 'Month YYYY') || '%';
  
  -- If entry exists, delete it and its lines to recreate
  IF journal_entry_id IS NOT NULL THEN
    DELETE FROM public.journal_lines WHERE journal_entry_id = journal_entry_id;
    DELETE FROM public.journal_entries WHERE id = journal_entry_id;
  END IF;
  
  -- Process cows that should be depreciated in the target month
  -- FIXED: Exclude cows disposed during the target month
  FOR cow_record IN 
    SELECT c.id, c.tag_number, c.purchase_price, c.salvage_value, c.freshen_date
    FROM public.cows c
    WHERE c.company_id = p_company_id 
      AND c.freshen_date <= target_date  -- Cow must have freshened by end of target month
      AND c.status = 'active'  -- Only active cows get monthly depreciation
      -- CRITICAL FIX: Exclude cows disposed during the target month
      AND NOT EXISTS (
        SELECT 1 FROM public.cow_dispositions cd 
        WHERE cd.cow_id = c.id 
        AND cd.disposition_date >= first_of_month 
        AND cd.disposition_date <= target_date
      )
  LOOP
    DECLARE
      monthly_depreciation NUMERIC;
    BEGIN
      -- Calculate monthly depreciation for this cow
      monthly_depreciation := public.calculate_cow_monthly_depreciation(
        cow_record.purchase_price,
        cow_record.salvage_value,
        cow_record.freshen_date,
        target_date
      );
      
      -- Add to total if there's depreciation
      IF monthly_depreciation > 0 THEN
        total_monthly_depreciation := total_monthly_depreciation + monthly_depreciation;
        cows_processed_count := cows_processed_count + 1;
      END IF;
    END;
  END LOOP;
  
  -- Create journal entry if there's depreciation to record
  IF total_monthly_depreciation > 0 THEN
    INSERT INTO public.journal_entries (
      company_id, entry_date, month, year, entry_type, description, total_amount
    ) VALUES (
      p_company_id,
      journal_date,
      journal_month,
      journal_year,
      'depreciation',
      CASE 
        WHEN p_processing_mode = 'production' THEN 
          'Monthly Depreciation - ' || TO_CHAR(target_date, 'Month YYYY') || ' (Posted in ' || TO_CHAR(journal_date, 'Month YYYY') || ')'
        ELSE 
          'Monthly Depreciation - ' || TO_CHAR(target_date, 'Month YYYY')
      END,
      total_monthly_depreciation
    ) RETURNING id INTO journal_entry_id;
    
    -- Create individual journal lines for each eligible cow
    FOR cow_record IN 
      SELECT c.id, c.tag_number, c.purchase_price, c.salvage_value, c.freshen_date
      FROM public.cows c
      WHERE c.company_id = p_company_id 
        AND c.freshen_date <= target_date
        AND c.status = 'active'
        AND NOT EXISTS (
          SELECT 1 FROM public.cow_dispositions cd 
          WHERE cd.cow_id = c.id 
          AND cd.disposition_date >= first_of_month 
          AND cd.disposition_date <= target_date
        )
    LOOP
      DECLARE
        monthly_depreciation NUMERIC;
      BEGIN
        -- Calculate monthly depreciation for this cow
        monthly_depreciation := public.calculate_cow_monthly_depreciation(
          cow_record.purchase_price,
          cow_record.salvage_value,
          cow_record.freshen_date,
          target_date
        );
        
        -- Create individual journal lines for this cow if there's depreciation
        IF monthly_depreciation > 0 THEN
          -- Debit line for depreciation expense
          INSERT INTO public.journal_lines (
            journal_entry_id, account_code, account_name, description, debit_amount, credit_amount, line_type, cow_id
          ) VALUES (
            journal_entry_id, 
            '6100', 
            'Depreciation Expense', 
            'Monthly depreciation - Cow #' || cow_record.tag_number || ' (' || TO_CHAR(target_date, 'Mon YYYY') || ')', 
            monthly_depreciation, 
            0, 
            'debit',
            cow_record.id
          );
          
          -- Credit line for accumulated depreciation
          INSERT INTO public.journal_lines (
            journal_entry_id, account_code, account_name, description, debit_amount, credit_amount, line_type, cow_id
          ) VALUES (
            journal_entry_id, 
            '1500.1', 
            'Accumulated Depreciation - Dairy Cows', 
            'Monthly depreciation - Cow #' || cow_record.tag_number || ' (' || TO_CHAR(target_date, 'Mon YYYY') || ')', 
            0, 
            monthly_depreciation, 
            'credit',
            cow_record.id
          );
        END IF;
      END;
    END LOOP;
  END IF;
  
  -- Update processing log
  UPDATE public.monthly_processing_log 
  SET status = 'completed', 
      cows_processed = cows_processed_count, 
      total_amount = total_monthly_depreciation,
      completed_at = now()
  WHERE id = processing_log_id;
  
  -- Return result
  result := jsonb_build_object(
    'success', true,
    'processing_mode', p_processing_mode,
    'target_period', p_target_month || '/' || p_target_year,
    'posted_to_period', journal_month || '/' || journal_year,
    'cows_processed', cows_processed_count,
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
$function$;