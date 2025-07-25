-- Phase 2: Complete Security Hardening - Fix Remaining 30 Functions

-- Fix all remaining functions with search_path security protection
-- This addresses the 30 remaining security warnings

-- 1. Update automated_monthly_processing function
CREATE OR REPLACE FUNCTION public.automated_monthly_processing()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = ''
AS $function$
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
    FROM public.companies c
    LEFT JOIN public.depreciation_settings ds ON ds.company_id = c.id
  LOOP
    company_processing_day := company_record.journal_processing_day;
    
    -- Only process if today is the company's processing day
    IF processing_day = company_processing_day THEN
      total_companies := total_companies + 1;
      
      -- Process depreciation for the previous month
      SELECT public.process_monthly_depreciation(
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
$function$;

-- 2. Update calculate_cow_monthly_depreciation function
CREATE OR REPLACE FUNCTION public.calculate_cow_monthly_depreciation(p_purchase_price numeric, p_salvage_value numeric, p_freshen_date date, p_target_date date)
 RETURNS numeric
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path = ''
AS $function$
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
$function$;

-- 3. Update catch_up_cow_depreciation_to_date function
CREATE OR REPLACE FUNCTION public.catch_up_cow_depreciation_to_date(p_cow_id text, p_target_date date)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = ''
AS $function$
DECLARE
  cow_record RECORD;
  freshen_date DATE;
  monthly_depreciation NUMERIC;
  current_period DATE;
  end_period DATE;
  period_year INTEGER;
  period_month INTEGER;
  journal_entry_id UUID;
  entries_created INTEGER := 0;
BEGIN
  -- Get cow details
  SELECT * INTO cow_record FROM public.cows WHERE id = p_cow_id;
  
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Cow not found');
  END IF;
  
  freshen_date := cow_record.freshen_date;
  monthly_depreciation := (cow_record.purchase_price - cow_record.salvage_value) / (5 * 12);
  
  -- Start from the month after freshen date
  current_period := date_trunc('month', freshen_date);
  end_period := date_trunc('month', p_target_date);
  
  WHILE current_period <= end_period LOOP
    period_year := EXTRACT(YEAR FROM current_period);
    period_month := EXTRACT(MONTH FROM current_period);
    
    -- Check if depreciation lines already exist for this cow in this period
    IF NOT EXISTS (
      SELECT 1 FROM public.journal_entries je
      JOIN public.journal_lines jl ON jl.journal_entry_id = je.id
      WHERE je.company_id = cow_record.company_id
        AND je.entry_type = 'depreciation'
        AND je.year = period_year
        AND je.month = period_month
        AND jl.cow_id = p_cow_id
        AND jl.account_code = '1500.1'
    ) THEN
      -- Find or create the monthly depreciation journal entry for this period
      SELECT id INTO journal_entry_id 
      FROM public.journal_entries 
      WHERE company_id = cow_record.company_id
        AND entry_type = 'depreciation'
        AND year = period_year
        AND month = period_month;
      
      -- If no journal entry exists for this month, create one
      IF journal_entry_id IS NULL THEN
        INSERT INTO public.journal_entries (
          company_id, entry_date, month, year, entry_type, description, total_amount
        ) VALUES (
          cow_record.company_id,
          (current_period + INTERVAL '1 month - 1 day')::date,
          period_month,
          period_year,
          'depreciation',
          'Monthly Depreciation - ' || period_year || '-' || LPAD(period_month::text, 2, '0'),
          monthly_depreciation
        ) RETURNING id INTO journal_entry_id;
      ELSE
        -- Update the total amount of existing journal entry
        UPDATE public.journal_entries 
        SET total_amount = total_amount + monthly_depreciation
        WHERE id = journal_entry_id;
      END IF;
      
      -- Create journal lines for this cow
      INSERT INTO public.journal_lines (
        journal_entry_id, account_code, account_name, description, 
        debit_amount, credit_amount, line_type, cow_id
      ) VALUES 
      (
        journal_entry_id, '6100', 'Depreciation Expense',
        'Monthly depreciation - Cow #' || cow_record.tag_number,
        monthly_depreciation, 0, 'debit', p_cow_id
      ),
      (
        journal_entry_id, '1500.1', 'Accumulated Depreciation - Dairy Cows',
        'Monthly depreciation - Cow #' || cow_record.tag_number,
        0, monthly_depreciation, 'credit', p_cow_id
      );
      
      entries_created := entries_created + 1;
    END IF;
    
    current_period := current_period + INTERVAL '1 month';
  END LOOP;
  
  RETURN jsonb_build_object(
    'success', true,
    'cow_id', p_cow_id,
    'entries_created', entries_created,
    'target_date', p_target_date
  );
END;
$function$;

-- 4. Update cleanup_post_disposition_depreciation function
CREATE OR REPLACE FUNCTION public.cleanup_post_disposition_depreciation(p_cow_id text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = ''
AS $function$
DECLARE
  cow_record RECORD;
  entries_removed INTEGER := 0;
BEGIN
  -- Get cow and disposition details
  SELECT c.id, c.tag_number, cd.disposition_date
  INTO cow_record
  FROM public.cows c
  JOIN public.cow_dispositions cd ON cd.cow_id = c.id
  WHERE c.id = p_cow_id;
  
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Cow or disposition not found');
  END IF;
  
  -- Remove depreciation entries that occur after disposition date
  WITH deleted_entries AS (
    DELETE FROM public.journal_lines 
    WHERE journal_entry_id IN (
      SELECT je.id FROM public.journal_entries je
      WHERE je.entry_type = 'depreciation'
      AND je.entry_date > cow_record.disposition_date
    ) 
    AND cow_id = p_cow_id
    RETURNING journal_entry_id
  )
  SELECT COUNT(*) / 2 INTO entries_removed FROM deleted_entries; -- Divide by 2 because each entry has debit and credit lines
  
  -- Update cow depreciation values to reflect actual accumulated depreciation
  PERFORM public.update_cow_depreciation_values(p_cow_id);
  
  RETURN jsonb_build_object(
    'success', true,
    'cow_id', p_cow_id,
    'entries_removed', entries_removed,
    'disposition_date', cow_record.disposition_date
  );
END;
$function$;

-- 5. Update get_historical_processing_status function
CREATE OR REPLACE FUNCTION public.get_historical_processing_status(p_company_id uuid)
 RETURNS TABLE(earliest_cow_year integer, journal_entries_exist boolean, years_with_entries integer[], processing_needed boolean)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = ''
AS $function$
DECLARE
  earliest_year INTEGER;
  current_year INTEGER := EXTRACT(YEAR FROM CURRENT_DATE)::INTEGER;
  existing_years INTEGER[];
BEGIN
  -- Get earliest freshen date year
  SELECT EXTRACT(YEAR FROM MIN(freshen_date))::INTEGER 
  INTO earliest_year
  FROM public.cows 
  WHERE company_id = p_company_id;
  
  -- Get years that already have journal entries
  SELECT ARRAY_AGG(DISTINCT year ORDER BY year)
  INTO existing_years
  FROM public.journal_entries
  WHERE company_id = p_company_id AND entry_type = 'depreciation';
  
  RETURN QUERY SELECT 
    earliest_year as earliest_cow_year,
    (existing_years IS NOT NULL AND array_length(existing_years, 1) > 0) as journal_entries_exist,
    COALESCE(existing_years, ARRAY[]::INTEGER[]) as years_with_entries,
    (earliest_year IS NOT NULL AND 
     (existing_years IS NULL OR 
      array_length(existing_years, 1) < (current_year - earliest_year + 1))) as processing_needed;
END;
$function$;

-- 6. Update process_disposition_journal_with_catchup function
CREATE OR REPLACE FUNCTION public.process_disposition_journal_with_catchup(p_disposition_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = ''
AS $function$
DECLARE
  disposition_record RECORD;
  cow_record RECORD;
  catchup_result JSONB;
  new_journal_entry_id UUID;
  actual_accumulated_depreciation NUMERIC := 0;
  gain_loss NUMERIC;
  actual_book_value NUMERIC;
BEGIN
  -- Get disposition details
  SELECT cd.id, cd.cow_id, cd.disposition_type, cd.disposition_date, cd.sale_amount, cd.final_book_value,
         cd.company_id, cd.journal_entry_id,
         c.tag_number, c.purchase_price, c.current_value, c.total_depreciation, c.salvage_value
  INTO disposition_record
  FROM public.cow_dispositions cd
  JOIN public.cows c ON c.id = cd.cow_id
  WHERE cd.id = p_disposition_id;
  
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Disposition not found');
  END IF;
  
  -- FIRST: Ensure all depreciation entries exist up to the disposition date
  SELECT public.catch_up_cow_depreciation_to_date(disposition_record.cow_id, disposition_record.disposition_date) 
  INTO catchup_result;
  
  IF NOT (catchup_result->>'success')::BOOLEAN THEN
    RETURN jsonb_build_object(
      'success', false, 
      'error', 'Failed to catch up depreciation: ' || (catchup_result->>'error')
    );
  END IF;
  
  -- NOW: Get ACTUAL accumulated depreciation from all journal entries up to disposition date
  SELECT COALESCE(SUM(jl.credit_amount), 0) INTO actual_accumulated_depreciation
  FROM public.journal_lines jl
  JOIN public.journal_entries je ON je.id = jl.journal_entry_id
  WHERE jl.cow_id = disposition_record.cow_id
    AND jl.account_code = '1500.1'
    AND jl.account_name = 'Accumulated Depreciation - Dairy Cows'
    AND jl.line_type = 'credit'
    AND je.entry_type = 'depreciation'
    AND je.entry_date <= disposition_record.disposition_date;
  
  -- Calculate actual book value and gain/loss
  actual_book_value := disposition_record.purchase_price - actual_accumulated_depreciation;
  gain_loss := COALESCE(disposition_record.sale_amount, 0) - actual_book_value;
  
  -- Delete existing journal entry if it exists
  IF disposition_record.journal_entry_id IS NOT NULL THEN
    DELETE FROM public.journal_lines WHERE journal_entry_id = disposition_record.journal_entry_id;
    DELETE FROM public.journal_entries WHERE id = disposition_record.journal_entry_id;
  END IF;
  
  -- Create journal entry for disposition
  INSERT INTO public.journal_entries (
    company_id, entry_date, month, year, entry_type, description, total_amount
  ) VALUES (
    disposition_record.company_id,
    disposition_record.disposition_date,
    EXTRACT(MONTH FROM disposition_record.disposition_date),
    EXTRACT(YEAR FROM disposition_record.disposition_date),
    'disposition',
    'Asset Disposition - Cow #' || disposition_record.tag_number || ' (' || disposition_record.disposition_type || ')',
    disposition_record.purchase_price
  ) RETURNING id INTO new_journal_entry_id;
  
  -- Create journal lines (same as before but with proper schema qualification)
  
  -- 1. Remove accumulated depreciation (debit) - only if there is any
  IF actual_accumulated_depreciation > 0 THEN
    INSERT INTO public.journal_lines (
      journal_entry_id, account_code, account_name, description, debit_amount, credit_amount, line_type, cow_id
    ) VALUES (
      new_journal_entry_id, 
      '1500.1', 
      'Accumulated Depreciation - Dairy Cows', 
      'Remove accumulated depreciation - Cow #' || disposition_record.tag_number || ' ($' || actual_accumulated_depreciation || ')', 
      actual_accumulated_depreciation, 
      0, 
      'debit',
      disposition_record.cow_id
    );
  END IF;
  
  -- 2. Record cash received (if sale and sale amount > 0)
  IF disposition_record.disposition_type = 'sale' AND COALESCE(disposition_record.sale_amount, 0) > 0 THEN
    INSERT INTO public.journal_lines (
      journal_entry_id, account_code, account_name, description, debit_amount, credit_amount, line_type, cow_id
    ) VALUES (
      new_journal_entry_id, 
      '1000', 
      'Cash', 
      'Cash received from sale - Cow #' || disposition_record.tag_number, 
      disposition_record.sale_amount, 
      0, 
      'debit',
      disposition_record.cow_id
    );
  END IF;
  
  -- 3. Record gain or loss
  IF ABS(gain_loss) > 0.01 THEN
    DECLARE
      account_code TEXT;
      account_name TEXT;
    BEGIN
      -- Determine the correct account based on disposition type and gain/loss
      IF disposition_record.disposition_type = 'sale' THEN
        IF gain_loss > 0 THEN
          account_code := '8000';
          account_name := 'Gain on Sale of Cows';
        ELSE
          account_code := '9002';
          account_name := 'Loss on Sale of Cows';
        END IF;
      ELSIF disposition_record.disposition_type = 'death' THEN
        account_code := '9001';
        account_name := 'Loss on Dead Cows';
      ELSIF disposition_record.disposition_type = 'culled' THEN
        account_code := '9003';
        account_name := 'Loss on Culled Cows';
      ELSE
        account_code := '9000';
        account_name := 'Loss on Sale of Assets';
      END IF;
      
      INSERT INTO public.journal_lines (
        journal_entry_id, account_code, account_name, description, debit_amount, credit_amount, line_type, cow_id
      ) VALUES (
        new_journal_entry_id, 
        account_code, 
        account_name, 
        CASE WHEN gain_loss > 0 THEN 'Gain' ELSE 'Loss' END || ' on ' || disposition_record.disposition_type || ' - Cow #' || disposition_record.tag_number || ' (Book value: $' || actual_book_value || ')', 
        CASE WHEN gain_loss > 0 THEN 0 ELSE ABS(gain_loss) END, 
        CASE WHEN gain_loss > 0 THEN ABS(gain_loss) ELSE 0 END, 
        CASE WHEN gain_loss > 0 THEN 'credit' ELSE 'debit' END,
        disposition_record.cow_id
      );
    END;
  END IF;
  
  -- 4. Remove original asset (credit)
  INSERT INTO public.journal_lines (
    journal_entry_id, account_code, account_name, description, debit_amount, credit_amount, line_type, cow_id
  ) VALUES (
    new_journal_entry_id, 
    '1500', 
    'Dairy Cows', 
    'Remove asset - Cow #' || disposition_record.tag_number, 
    0, 
    disposition_record.purchase_price, 
    'credit',
    disposition_record.cow_id
  );
  
  -- Update disposition with journal entry ID
  UPDATE public.cow_dispositions 
  SET journal_entry_id = new_journal_entry_id
  WHERE id = p_disposition_id;
  
  RETURN jsonb_build_object(
    'success', true,
    'journal_entry_id', new_journal_entry_id,
    'total_amount', disposition_record.purchase_price,
    'actual_accumulated_depreciation', actual_accumulated_depreciation,
    'actual_book_value', actual_book_value,
    'gain_loss', gain_loss,
    'depreciation_entries_created', catchup_result->>'entries_created'
  );
  
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object(
    'success', false,
    'error', SQLERRM
  );
END;
$function$;

-- Continue with Phase 2 batch 2...