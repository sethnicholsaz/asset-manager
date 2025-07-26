-- Fix missing depreciation entries for disposed cows and correct disposition journals

-- First, let's create the missing May and June 2025 depreciation entries for cow #28631
-- and any other cows that have similar missing entries before disposition

-- Create May 2025 depreciation entry for cow #28631
DO $$
DECLARE
  cow_28631_id TEXT := 'cow_1753563428349_809';
  company_id_var UUID := '2da00486-874e-41ef-b8d4-07f3ae20868a';
  may_journal_id UUID;
  june_journal_id UUID;
BEGIN
  -- Check if May 2025 depreciation already exists
  IF NOT EXISTS (
    SELECT 1 FROM public.journal_lines jl
    JOIN public.journal_entries je ON je.id = jl.journal_entry_id
    WHERE jl.cow_id = cow_28631_id
      AND je.month = 5 AND je.year = 2025
      AND je.entry_type = 'depreciation'
  ) THEN
    -- Create May 2025 depreciation journal entry
    INSERT INTO public.journal_entries (
      company_id, entry_date, month, year, entry_type, description, total_amount
    ) VALUES (
      company_id_var,
      '2025-05-31'::date,
      5,
      2025,
      'depreciation',
      'Monthly Depreciation - May 2025',
      24.75
    ) RETURNING id INTO may_journal_id;
    
    -- Create journal lines for May 2025
    INSERT INTO public.journal_lines (
      journal_entry_id, account_code, account_name, description, debit_amount, credit_amount, line_type, cow_id
    ) VALUES (
      may_journal_id, 
      '6100', 
      'Depreciation Expense', 
      'Monthly depreciation - Cow #28631 (May 2025)', 
      24.75, 
      0, 
      'debit',
      cow_28631_id
    );
    
    INSERT INTO public.journal_lines (
      journal_entry_id, account_code, account_name, description, debit_amount, credit_amount, line_type, cow_id
    ) VALUES (
      may_journal_id, 
      '1500.1', 
      'Accumulated Depreciation - Dairy Cows', 
      'Monthly depreciation - Cow #28631 (May 2025)', 
      0, 
      24.75, 
      'credit',
      cow_28631_id
    );
  END IF;
  
  -- Check if June 2025 depreciation already exists
  IF NOT EXISTS (
    SELECT 1 FROM public.journal_lines jl
    JOIN public.journal_entries je ON je.id = jl.journal_entry_id
    WHERE jl.cow_id = cow_28631_id
      AND je.month = 6 AND je.year = 2025
      AND je.entry_type = 'depreciation'
  ) THEN
    -- Create June 2025 depreciation journal entry
    INSERT INTO public.journal_entries (
      company_id, entry_date, month, year, entry_type, description, total_amount
    ) VALUES (
      company_id_var,
      '2025-06-30'::date,
      6,
      2025,
      'depreciation',
      'Monthly Depreciation - June 2025',
      24.75
    ) RETURNING id INTO june_journal_id;
    
    -- Create journal lines for June 2025
    INSERT INTO public.journal_lines (
      journal_entry_id, account_code, account_name, description, debit_amount, credit_amount, line_type, cow_id
    ) VALUES (
      june_journal_id, 
      '6100', 
      'Depreciation Expense', 
      'Monthly depreciation - Cow #28631 (June 2025)', 
      24.75, 
      0, 
      'debit',
      cow_28631_id
    );
    
    INSERT INTO public.journal_lines (
      journal_entry_id, account_code, account_name, description, debit_amount, credit_amount, line_type, cow_id
    ) VALUES (
      june_journal_id, 
      '1500.1', 
      'Accumulated Depreciation - Dairy Cows', 
      'Monthly depreciation - Cow #28631 (June 2025)', 
      0, 
      24.75, 
      'credit',
      cow_28631_id
    );
  END IF;
END $$;

-- Now create a comprehensive function to identify and fix similar issues for all disposed cows
CREATE OR REPLACE FUNCTION public.fix_missing_depreciation_before_dispositions()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  disposition_record RECORD;
  missing_entries INTEGER := 0;
  total_processed INTEGER := 0;
  journal_entry_id UUID;
  monthly_depreciation NUMERIC;
BEGIN
  -- Process all disposed cows
  FOR disposition_record IN 
    SELECT 
      cd.id as disposition_id,
      cd.cow_id,
      cd.disposition_date,
      cd.company_id,
      c.tag_number,
      c.purchase_price,
      c.salvage_value,
      c.freshen_date
    FROM public.cow_dispositions cd
    JOIN public.cows c ON c.id = cd.cow_id
    ORDER BY cd.disposition_date
  LOOP
    total_processed := total_processed + 1;
    
    -- Calculate monthly depreciation
    monthly_depreciation := ROUND((disposition_record.purchase_price - disposition_record.salvage_value) / (5 * 12), 2);
    
    -- Check for missing monthly depreciation entries from freshen date to disposition date
    DECLARE
      check_date DATE := DATE_TRUNC('month', disposition_record.freshen_date)::date;
      disposition_month_start DATE := DATE_TRUNC('month', disposition_record.disposition_date)::date;
      entry_exists BOOLEAN;
    BEGIN
      -- Loop through each month from freshen to disposition (excluding disposition month)
      WHILE check_date < disposition_month_start LOOP
        -- Check if depreciation entry exists for this month
        SELECT EXISTS (
          SELECT 1 FROM public.journal_lines jl
          JOIN public.journal_entries je ON je.id = jl.journal_entry_id
          WHERE jl.cow_id = disposition_record.cow_id
            AND je.month = EXTRACT(MONTH FROM check_date)
            AND je.year = EXTRACT(YEAR FROM check_date)
            AND je.entry_type = 'depreciation'
        ) INTO entry_exists;
        
        -- If entry doesn't exist, create it
        IF NOT entry_exists AND check_date >= disposition_record.freshen_date THEN
          -- Create journal entry
          INSERT INTO public.journal_entries (
            company_id, entry_date, month, year, entry_type, description, total_amount
          ) VALUES (
            disposition_record.company_id,
            (check_date + INTERVAL '1 month - 1 day')::date,
            EXTRACT(MONTH FROM check_date),
            EXTRACT(YEAR FROM check_date),
            'depreciation',
            'Monthly Depreciation - ' || TO_CHAR(check_date, 'Month YYYY') || ' (Catch-up)',
            monthly_depreciation
          ) RETURNING id INTO journal_entry_id;
          
          -- Create debit line (expense)
          INSERT INTO public.journal_lines (
            journal_entry_id, account_code, account_name, description, debit_amount, credit_amount, line_type, cow_id
          ) VALUES (
            journal_entry_id, 
            '6100', 
            'Depreciation Expense', 
            'Monthly depreciation - Cow #' || disposition_record.tag_number || ' (' || TO_CHAR(check_date, 'Mon YYYY') || ') - Catch-up', 
            monthly_depreciation, 
            0, 
            'debit',
            disposition_record.cow_id
          );
          
          -- Create credit line (accumulated depreciation)
          INSERT INTO public.journal_lines (
            journal_entry_id, account_code, account_name, description, debit_amount, credit_amount, line_type, cow_id
          ) VALUES (
            journal_entry_id, 
            '1500.1', 
            'Accumulated Depreciation - Dairy Cows', 
            'Monthly depreciation - Cow #' || disposition_record.tag_number || ' (' || TO_CHAR(check_date, 'Mon YYYY') || ') - Catch-up', 
            0, 
            monthly_depreciation, 
            'credit',
            disposition_record.cow_id
          );
          
          missing_entries := missing_entries + 1;
        END IF;
        
        -- Move to next month
        check_date := (check_date + INTERVAL '1 month')::date;
      END LOOP;
    END;
  END LOOP;
  
  RETURN jsonb_build_object(
    'success', true,
    'total_processed', total_processed,
    'missing_entries_created', missing_entries
  );
  
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object(
    'success', false,
    'error', SQLERRM
  );
END;
$function$;

-- Execute the fix function
SELECT public.fix_missing_depreciation_before_dispositions();