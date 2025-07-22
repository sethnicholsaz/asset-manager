-- Fix the process_monthly_depreciation function to include historically active cows
CREATE OR REPLACE FUNCTION public.process_monthly_depreciation(p_company_id uuid, p_target_month integer, p_target_year integer)
 RETURNS jsonb
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
  
  -- Process each cow that was active during the target period
  -- Include cows that had freshened by the target date and either:
  -- 1. Are still active, OR
  -- 2. Were disposed after the target date
  FOR cow_record IN 
    SELECT c.id, c.tag_number, c.purchase_price, c.salvage_value, c.freshen_date
    FROM cows c
    LEFT JOIN cow_dispositions cd ON cd.cow_id = c.id
    WHERE c.company_id = p_company_id 
      AND c.freshen_date <= target_date
      AND (c.status = 'active' OR cd.disposition_date > target_date OR cd.disposition_date IS NULL)
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