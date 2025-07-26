-- Comprehensive fix for all missing depreciation entries for disposed cows

CREATE OR REPLACE FUNCTION public.fix_all_missing_depreciation_comprehensive()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  disposed_cow RECORD;
  check_date DATE;
  end_check_date DATE;
  journal_entry_id UUID;
  monthly_depreciation NUMERIC;
  company_id_var UUID := '2da00486-874e-41ef-b8d4-07f3ae20868a';
  total_fixed INTEGER := 0;
  entries_added INTEGER := 0;
  entry_exists BOOLEAN;
BEGIN
  -- Process all disposed cows since 2025
  FOR disposed_cow IN 
    SELECT 
      c.id,
      c.tag_number,
      c.purchase_price,
      c.salvage_value,
      c.freshen_date,
      cd.disposition_date
    FROM public.cows c
    JOIN public.cow_dispositions cd ON cd.cow_id = c.id
    WHERE cd.disposition_date >= '2025-01-01'  -- Check all 2025 dispositions
    ORDER BY cd.disposition_date, c.tag_number
  LOOP
    total_fixed := total_fixed + 1;
    
    -- Calculate monthly depreciation for this cow
    monthly_depreciation := ROUND((disposed_cow.purchase_price - disposed_cow.salvage_value) / (5 * 12), 2);
    
    -- Start checking from the month after freshen date
    check_date := DATE_TRUNC('month', disposed_cow.freshen_date + INTERVAL '1 month')::date;
    
    -- End checking at the start of disposition month (don't include disposition month itself)
    end_check_date := DATE_TRUNC('month', disposed_cow.disposition_date)::date;
    
    -- Loop through each month from freshen+1 to disposition month (exclusive)
    WHILE check_date < end_check_date LOOP
      -- Check if depreciation entry exists for this cow in this month
      SELECT EXISTS (
        SELECT 1 FROM public.journal_lines jl
        JOIN public.journal_entries je ON je.id = jl.journal_entry_id
        WHERE jl.cow_id = disposed_cow.id
          AND je.month = EXTRACT(MONTH FROM check_date)
          AND je.year = EXTRACT(YEAR FROM check_date)
          AND je.entry_type = 'depreciation'
      ) INTO entry_exists;
      
      -- If entry doesn't exist, create or add to existing journal entry
      IF NOT entry_exists THEN
        -- Get or create journal entry for this month/year
        SELECT id INTO journal_entry_id
        FROM public.journal_entries 
        WHERE company_id = company_id_var
          AND month = EXTRACT(MONTH FROM check_date)
          AND year = EXTRACT(YEAR FROM check_date)
          AND entry_type = 'depreciation';
        
        -- Create journal entry if it doesn't exist
        IF journal_entry_id IS NULL THEN
          INSERT INTO public.journal_entries (
            company_id, entry_date, month, year, entry_type, description, total_amount
          ) VALUES (
            company_id_var,
            (check_date + INTERVAL '1 month - 1 day')::date,
            EXTRACT(MONTH FROM check_date),
            EXTRACT(YEAR FROM check_date),
            'depreciation',
            'Monthly Depreciation - ' || TO_CHAR(check_date, 'YYYY-MM'),
            0  -- Will be updated as we add entries
          ) RETURNING id INTO journal_entry_id;
        END IF;
        
        -- Add depreciation lines for this cow
        INSERT INTO public.journal_lines (
          journal_entry_id, account_code, account_name, description, debit_amount, credit_amount, line_type, cow_id
        ) VALUES (
          journal_entry_id, 
          '6100', 
          'Depreciation Expense', 
          'Monthly depreciation - Cow #' || disposed_cow.tag_number || ' (' || TO_CHAR(check_date, 'Mon YYYY') || ') - Catchup', 
          monthly_depreciation, 
          0, 
          'debit',
          disposed_cow.id
        );
        
        INSERT INTO public.journal_lines (
          journal_entry_id, account_code, account_name, description, debit_amount, credit_amount, line_type, cow_id
        ) VALUES (
          journal_entry_id, 
          '1500.1', 
          'Accumulated Depreciation - Dairy Cows', 
          'Monthly depreciation - Cow #' || disposed_cow.tag_number || ' (' || TO_CHAR(check_date, 'Mon YYYY') || ') - Catchup', 
          0, 
          monthly_depreciation, 
          'credit',
          disposed_cow.id
        );
        
        -- Update journal entry total
        UPDATE public.journal_entries 
        SET total_amount = total_amount + monthly_depreciation
        WHERE id = journal_entry_id;
        
        entries_added := entries_added + 1;
      END IF;
      
      -- Move to next month
      check_date := (check_date + INTERVAL '1 month')::date;
    END LOOP;
  END LOOP;
  
  RETURN jsonb_build_object(
    'success', true,
    'total_cows_processed', total_fixed,
    'depreciation_entries_added', entries_added
  );
  
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object(
    'success', false,
    'error', SQLERRM
  );
END;
$function$;

-- Execute the comprehensive fix
SELECT public.fix_all_missing_depreciation_comprehensive();