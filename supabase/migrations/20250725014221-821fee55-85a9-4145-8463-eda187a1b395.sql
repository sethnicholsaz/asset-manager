-- Phase 2 Batch 2: Fix remaining functions with search_path protection

-- 7. Update process_historical_depreciation function
CREATE OR REPLACE FUNCTION public.process_historical_depreciation(p_company_id uuid, p_start_year integer DEFAULT NULL::integer, p_end_year integer DEFAULT NULL::integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = ''
AS $function$
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
  FROM public.cows 
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
        SELECT public.process_monthly_depreciation(p_company_id, current_month, current_year) INTO monthly_result;
        
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
$function$;

-- 8. Update process_historical_depreciation_by_year function
CREATE OR REPLACE FUNCTION public.process_historical_depreciation_by_year(p_company_id uuid, p_target_year integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = ''
AS $function$
DECLARE
  current_month INTEGER;
  monthly_result JSONB;
  total_processed INTEGER := 0;
  total_amount NUMERIC := 0;
  year_start_date DATE;
  year_end_date DATE;
  last_complete_month INTEGER;
  last_complete_year INTEGER;
BEGIN
  -- Calculate the last completed month (previous month)
  IF EXTRACT(MONTH FROM CURRENT_DATE) = 1 THEN
    last_complete_month := 12;
    last_complete_year := EXTRACT(YEAR FROM CURRENT_DATE)::INTEGER - 1;
  ELSE
    last_complete_month := EXTRACT(MONTH FROM CURRENT_DATE)::INTEGER - 1;
    last_complete_year := EXTRACT(YEAR FROM CURRENT_DATE)::INTEGER;
  END IF;
  
  -- Set year boundaries
  year_start_date := (p_target_year || '-01-01')::DATE;
  year_end_date := (p_target_year || '-12-31')::DATE;
  
  -- Don't process future years
  IF year_start_date > CURRENT_DATE THEN
    RETURN jsonb_build_object(
      'success', true,
      'message', 'Skipping future year',
      'year', p_target_year,
      'months_processed', 0,
      'total_amount', 0
    );
  END IF;
  
  -- Process each month in the year up to last completed month
  FOR current_month IN 1..12 LOOP
    DECLARE
      month_date DATE := (p_target_year || '-' || LPAD(current_month::TEXT, 2, '0') || '-01')::DATE;
    BEGIN
      -- Stop at last completed month
      IF (p_target_year > last_complete_year) OR 
         (p_target_year = last_complete_year AND current_month > last_complete_month) THEN
        EXIT; -- Stop processing future months
      END IF;
      
      -- Process this month
      SELECT public.process_monthly_depreciation(p_company_id, current_month, p_target_year) INTO monthly_result;
      
      -- Accumulate results
      IF (monthly_result->>'success')::BOOLEAN THEN
        total_processed := total_processed + COALESCE((monthly_result->>'cows_processed')::INTEGER, 0);
        total_amount := total_amount + COALESCE((monthly_result->>'total_amount')::NUMERIC, 0);
      END IF;
      
      -- Small delay between months
      PERFORM pg_sleep(0.05);
    END;
  END LOOP;
  
  RETURN jsonb_build_object(
    'success', true,
    'year', p_target_year,
    'months_processed', current_month - 1,
    'cows_processed', total_processed,
    'total_amount', total_amount
  );
  
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object(
    'success', false,
    'error', SQLERRM,
    'year', p_target_year
  );
END;
$function$;

-- 9. Update process_monthly_depreciation function
CREATE OR REPLACE FUNCTION public.process_monthly_depreciation(p_company_id uuid, p_target_month integer, p_target_year integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = ''
AS $function$
DECLARE
  cow_record RECORD;
  total_monthly_depreciation NUMERIC := 0;
  cows_processed_count INTEGER := 0;
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
  
  -- Process cows that should be depreciated in the target month
  FOR cow_record IN 
    SELECT c.id, c.tag_number, c.purchase_price, c.salvage_value, c.freshen_date,
           cd.disposition_date, cd.disposition_type
    FROM public.cows c
    LEFT JOIN public.cow_dispositions cd ON cd.cow_id = c.id AND cd.company_id = c.company_id
    WHERE c.company_id = p_company_id 
      AND c.freshen_date <= target_date  -- Cow must have freshened by end of target month
      -- CRITICAL FIX: Exclude cows that were disposed before the end of the target month
      AND (cd.disposition_date IS NULL OR cd.disposition_date > target_date)
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
      target_date,
      p_target_month,
      p_target_year,
      'depreciation',
      'Monthly Depreciation - ' || TO_CHAR(target_date, 'Month YYYY'),
      total_monthly_depreciation
    ) RETURNING id INTO journal_entry_id;
    
    -- Create individual journal lines for each eligible cow
    FOR cow_record IN 
      SELECT c.id, c.tag_number, c.purchase_price, c.salvage_value, c.freshen_date,
             cd.disposition_date, cd.disposition_type
      FROM public.cows c
      LEFT JOIN public.cow_dispositions cd ON cd.cow_id = c.id AND cd.company_id = c.company_id
      WHERE c.company_id = p_company_id 
        AND c.freshen_date <= target_date
        -- Same exclusion logic as above
        AND (cd.disposition_date IS NULL OR cd.disposition_date > target_date)
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
            'Monthly depreciation - Cow #' || cow_record.tag_number, 
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
            'Monthly depreciation - Cow #' || cow_record.tag_number, 
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

-- 10. Update reverse_journal_entry function
CREATE OR REPLACE FUNCTION public.reverse_journal_entry(p_journal_entry_id uuid, p_reason text DEFAULT 'Journal reversal'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = ''
AS $function$
DECLARE
  original_entry RECORD;
  reversal_entry_id UUID;
  line_record RECORD;
BEGIN
  -- Get original journal entry
  SELECT * INTO original_entry
  FROM public.journal_entries
  WHERE id = p_journal_entry_id;
  
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Journal entry not found');
  END IF;
  
  -- Create reversal entry
  INSERT INTO public.journal_entries (
    company_id, entry_date, month, year, entry_type, description, total_amount
  ) VALUES (
    original_entry.company_id,
    CURRENT_DATE,
    EXTRACT(MONTH FROM CURRENT_DATE),
    EXTRACT(YEAR FROM CURRENT_DATE),
    original_entry.entry_type || '_reversal',
    'REVERSAL: ' || original_entry.description || ' - ' || p_reason,
    original_entry.total_amount
  ) RETURNING id INTO reversal_entry_id;
  
  -- Create reversed journal lines (swap debits and credits)
  FOR line_record IN 
    SELECT * FROM public.journal_lines WHERE journal_entry_id = p_journal_entry_id
  LOOP
    INSERT INTO public.journal_lines (
      journal_entry_id, account_code, account_name, description, 
      debit_amount, credit_amount, line_type, cow_id
    ) VALUES (
      reversal_entry_id,
      line_record.account_code,
      line_record.account_name,
      'REVERSAL: ' || line_record.description,
      line_record.credit_amount,  -- Swap credit to debit
      line_record.debit_amount,   -- Swap debit to credit
      CASE WHEN line_record.line_type = 'debit' THEN 'credit' ELSE 'debit' END,
      line_record.cow_id
    );
  END LOOP;
  
  RETURN jsonb_build_object(
    'success', true,
    'reversal_entry_id', reversal_entry_id,
    'original_entry_id', p_journal_entry_id
  );
  
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object(
    'success', false,
    'error', SQLERRM
  );
END;
$function$;

-- 11. Update update_cow_depreciation_values function
CREATE OR REPLACE FUNCTION public.update_cow_depreciation_values(p_cow_id text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = ''
AS $function$
DECLARE
  total_accumulated_depreciation NUMERIC := 0;
  cow_purchase_price NUMERIC;
BEGIN
  -- Get the cow's purchase price
  SELECT purchase_price INTO cow_purchase_price 
  FROM public.cows 
  WHERE id = p_cow_id;
  
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Cow not found');
  END IF;
  
  -- Calculate total accumulated depreciation from journal entries
  SELECT COALESCE(SUM(jl.credit_amount), 0) INTO total_accumulated_depreciation
  FROM public.journal_entries je
  JOIN public.journal_lines jl ON jl.journal_entry_id = je.id
  WHERE jl.cow_id = p_cow_id 
    AND je.entry_type = 'depreciation'
    AND jl.account_code = '1500.1';
  
  -- Update cow record
  UPDATE public.cows 
  SET total_depreciation = total_accumulated_depreciation,
      current_value = cow_purchase_price - total_accumulated_depreciation
  WHERE id = p_cow_id;
  
  RETURN jsonb_build_object(
    'success', true,
    'cow_id', p_cow_id,
    'total_depreciation', total_accumulated_depreciation,
    'current_value', cow_purchase_price - total_accumulated_depreciation
  );
END;
$function$;

-- 12. Update update_cow_on_disposition trigger function
CREATE OR REPLACE FUNCTION public.update_cow_on_disposition()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path = ''
AS $function$
BEGIN
  -- Update the cow's current value to 0 and status when disposed
  UPDATE public.cows 
  SET current_value = 0,
      status = CASE 
        WHEN NEW.disposition_type = 'sale' THEN 'sold'
        WHEN NEW.disposition_type = 'death' THEN 'deceased'
        WHEN NEW.disposition_type = 'culled' THEN 'sold'
        ELSE 'inactive'
      END,
      updated_at = now()
  WHERE id = NEW.cow_id;
  
  RETURN NEW;
END;
$function$;

-- Continue with remaining functions...