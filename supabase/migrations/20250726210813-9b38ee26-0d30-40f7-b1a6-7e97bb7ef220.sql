-- Fix all disposed cows missing May and June 2025 depreciation entries

CREATE OR REPLACE FUNCTION public.fix_all_missing_may_june_depreciation()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  disposed_cow RECORD;
  may_journal_id UUID;
  june_journal_id UUID;
  monthly_depreciation NUMERIC;
  company_id_var UUID := '2da00486-874e-41ef-b8d4-07f3ae20868a';
  total_fixed INTEGER := 0;
  may_entries_added INTEGER := 0;
  june_entries_added INTEGER := 0;
BEGIN
  -- Get May 2025 journal entry ID (it should exist)
  SELECT id INTO may_journal_id
  FROM public.journal_entries 
  WHERE company_id = company_id_var
    AND month = 5 AND year = 2025 
    AND entry_type = 'depreciation';
  
  -- Get June 2025 journal entry ID (create if it doesn't exist)
  SELECT id INTO june_journal_id
  FROM public.journal_entries 
  WHERE company_id = company_id_var
    AND month = 6 AND year = 2025 
    AND entry_type = 'depreciation';
  
  -- Create June entry if it doesn't exist
  IF june_journal_id IS NULL THEN
    INSERT INTO public.journal_entries (
      company_id, entry_date, month, year, entry_type, description, total_amount
    ) VALUES (
      company_id_var,
      '2025-06-30'::date,
      6,
      2025,
      'depreciation',
      'Monthly Depreciation - 2025-06',
      0  -- Will be updated as we add cow entries
    ) RETURNING id INTO june_journal_id;
  END IF;
  
  -- Process all disposed cows that are missing May/June entries
  FOR disposed_cow IN 
    SELECT 
      c.id,
      c.tag_number,
      c.purchase_price,
      c.salvage_value,
      cd.disposition_date
    FROM public.cows c
    JOIN public.cow_dispositions cd ON cd.cow_id = c.id
    WHERE cd.disposition_date >= '2025-07-01'  -- Disposed in July or later
    ORDER BY c.tag_number
  LOOP
    total_fixed := total_fixed + 1;
    
    -- Calculate monthly depreciation for this cow
    monthly_depreciation := ROUND((disposed_cow.purchase_price - disposed_cow.salvage_value) / (5 * 12), 2);
    
    -- Check and add May 2025 entry if missing
    IF NOT EXISTS (
      SELECT 1 FROM public.journal_lines 
      WHERE journal_entry_id = may_journal_id 
        AND cow_id = disposed_cow.id
    ) THEN
      -- Add May depreciation lines
      INSERT INTO public.journal_lines (
        journal_entry_id, account_code, account_name, description, debit_amount, credit_amount, line_type, cow_id
      ) VALUES (
        may_journal_id, 
        '6100', 
        'Depreciation Expense', 
        'Monthly depreciation - Cow #' || disposed_cow.tag_number || ' (May 2025)', 
        monthly_depreciation, 
        0, 
        'debit',
        disposed_cow.id
      );
      
      INSERT INTO public.journal_lines (
        journal_entry_id, account_code, account_name, description, debit_amount, credit_amount, line_type, cow_id
      ) VALUES (
        may_journal_id, 
        '1500.1', 
        'Accumulated Depreciation - Dairy Cows', 
        'Monthly depreciation - Cow #' || disposed_cow.tag_number || ' (May 2025)', 
        0, 
        monthly_depreciation, 
        'credit',
        disposed_cow.id
      );
      
      -- Update May journal entry total
      UPDATE public.journal_entries 
      SET total_amount = total_amount + monthly_depreciation
      WHERE id = may_journal_id;
      
      may_entries_added := may_entries_added + 1;
    END IF;
    
    -- Check and add June 2025 entry if missing
    IF NOT EXISTS (
      SELECT 1 FROM public.journal_lines 
      WHERE journal_entry_id = june_journal_id 
        AND cow_id = disposed_cow.id
    ) THEN
      -- Add June depreciation lines
      INSERT INTO public.journal_lines (
        journal_entry_id, account_code, account_name, description, debit_amount, credit_amount, line_type, cow_id
      ) VALUES (
        june_journal_id, 
        '6100', 
        'Depreciation Expense', 
        'Monthly depreciation - Cow #' || disposed_cow.tag_number || ' (June 2025)', 
        monthly_depreciation, 
        0, 
        'debit',
        disposed_cow.id
      );
      
      INSERT INTO public.journal_lines (
        journal_entry_id, account_code, account_name, description, debit_amount, credit_amount, line_type, cow_id
      ) VALUES (
        june_journal_id, 
        '1500.1', 
        'Accumulated Depreciation - Dairy Cows', 
        'Monthly depreciation - Cow #' || disposed_cow.tag_number || ' (June 2025)', 
        0, 
        monthly_depreciation, 
        'credit',
        disposed_cow.id
      );
      
      -- Update June journal entry total
      UPDATE public.journal_entries 
      SET total_amount = total_amount + monthly_depreciation
      WHERE id = june_journal_id;
      
      june_entries_added := june_entries_added + 1;
    END IF;
  END LOOP;
  
  RETURN jsonb_build_object(
    'success', true,
    'total_cows_processed', total_fixed,
    'may_entries_added', may_entries_added,
    'june_entries_added', june_entries_added,
    'may_journal_id', may_journal_id,
    'june_journal_id', june_journal_id
  );
  
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object(
    'success', false,
    'error', SQLERRM
  );
END;
$function$;

-- Execute the comprehensive fix
SELECT public.fix_all_missing_may_june_depreciation();