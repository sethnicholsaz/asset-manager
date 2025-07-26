-- Fix the depreciation calculation issues for disposed cows
-- This addresses the problem where cows are getting full month depreciation 
-- after their disposition date

-- 1. Remove invalid depreciation entries that occur after disposition dates
WITH invalid_entries AS (
  SELECT DISTINCT jl.journal_entry_id
  FROM public.journal_lines jl
  JOIN public.journal_entries je ON je.id = jl.journal_entry_id
  JOIN public.cow_dispositions cd ON cd.cow_id = jl.cow_id
  WHERE je.entry_type = 'depreciation'
    AND je.entry_date > cd.disposition_date
    AND jl.cow_id IS NOT NULL
)
DELETE FROM public.journal_lines 
WHERE journal_entry_id IN (SELECT journal_entry_id FROM invalid_entries);

-- 2. Remove the empty journal entries
WITH invalid_entries AS (
  SELECT DISTINCT je.id
  FROM public.journal_entries je
  JOIN public.cow_dispositions cd ON true -- cross join to get all combinations
  WHERE je.entry_type = 'depreciation'
    AND je.entry_date > cd.disposition_date
    AND NOT EXISTS (
      SELECT 1 FROM public.journal_lines jl 
      WHERE jl.journal_entry_id = je.id
    )
)
DELETE FROM public.journal_entries 
WHERE id IN (SELECT id FROM invalid_entries);

-- 3. Fix Cow #41362 specifically - remove the invalid May 31 entry
DELETE FROM public.journal_lines 
WHERE journal_entry_id IN (
  SELECT je.id 
  FROM public.journal_entries je
  WHERE je.entry_type = 'depreciation'
    AND je.entry_date = '2025-05-31'
    AND je.description LIKE '%May%'
) AND cow_id = 'cow_1753551709333_6';

-- Remove the empty journal entry
DELETE FROM public.journal_entries 
WHERE entry_type = 'depreciation'
  AND entry_date = '2025-05-31'
  AND description LIKE '%May%'
  AND NOT EXISTS (
    SELECT 1 FROM public.journal_lines jl 
    WHERE jl.journal_entry_id = journal_entries.id
  );

-- 4. Create proper partial month depreciation for May (25 days)
-- Calculate correct partial month depreciation for cow #41362
DO $$ 
DECLARE
  partial_depreciation NUMERIC;
  journal_entry_id UUID;
  cow_purchase_price NUMERIC := 1997.28;
  cow_salvage_value NUMERIC := 199.73;
  monthly_rate NUMERIC;
BEGIN
  -- Calculate monthly depreciation rate
  monthly_rate := ROUND((cow_purchase_price - cow_salvage_value) / (5 * 12), 2);
  
  -- Calculate partial month (25 days of May)
  partial_depreciation := ROUND(monthly_rate * 25 / 31, 2);
  
  -- Create partial month depreciation entry
  INSERT INTO public.journal_entries (
    company_id, entry_date, month, year, entry_type, description, total_amount
  ) VALUES (
    '2da00486-874e-41ef-b8d4-07f3ae20868a',
    '2025-05-25',
    5,
    2025,
    'depreciation',
    'Partial month depreciation - Cow #41362 (through 2025-05-25)',
    partial_depreciation
  ) RETURNING id INTO journal_entry_id;
  
  -- Create journal lines for partial depreciation
  INSERT INTO public.journal_lines (
    journal_entry_id, account_code, account_name, description, debit_amount, credit_amount, line_type, cow_id
  ) VALUES (
    journal_entry_id, 
    '6100', 
    'Depreciation Expense', 
    'Partial month depreciation - Cow #41362 (25 days)', 
    partial_depreciation, 
    0, 
    'debit',
    'cow_1753551709333_6'
  );
  
  INSERT INTO public.journal_lines (
    journal_entry_id, account_code, account_name, description, debit_amount, credit_amount, line_type, cow_id
  ) VALUES (
    journal_entry_id, 
    '1500.1', 
    'Accumulated Depreciation - Dairy Cows', 
    'Partial month depreciation - Cow #41362 (25 days)', 
    0, 
    partial_depreciation, 
    'credit',
    'cow_1753551709333_6'
  );
END $$;

-- 5. Update the cow's total depreciation to reflect actual amounts
UPDATE public.cows
SET 
  total_depreciation = (
    SELECT COALESCE(SUM(jl.credit_amount), 0)
    FROM public.journal_lines jl
    JOIN public.journal_entries je ON je.id = jl.journal_entry_id
    WHERE jl.cow_id = 'cow_1753551709333_6'
      AND jl.account_code = '1500.1'
      AND jl.line_type = 'credit'
      AND je.entry_type = 'depreciation'
  ),
  current_value = 0.00,  -- Already disposed
  updated_at = now()
WHERE id = 'cow_1753551709333_6';

-- 6. Ensure the monthly processing function properly excludes disposed cows
-- Update the function to be more explicit about the exclusion logic
CREATE OR REPLACE FUNCTION public.process_monthly_depreciation(p_company_id uuid, p_target_month integer, p_target_year integer)
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
  -- CRITICAL: Exclude cows that were disposed BEFORE OR DURING the target month
  FOR cow_record IN 
    SELECT c.id, c.tag_number, c.purchase_price, c.salvage_value, c.freshen_date
    FROM public.cows c
    WHERE c.company_id = p_company_id 
      AND c.freshen_date <= target_date  -- Cow must have freshened by end of target month
      AND c.status = 'active'  -- Only active cows get monthly depreciation
      -- Explicitly exclude disposed cows
      AND NOT EXISTS (
        SELECT 1 FROM public.cow_dispositions cd 
        WHERE cd.cow_id = c.id 
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
      target_date,
      p_target_month,
      p_target_year,
      'depreciation',
      'Monthly Depreciation - ' || TO_CHAR(target_date, 'Month YYYY'),
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