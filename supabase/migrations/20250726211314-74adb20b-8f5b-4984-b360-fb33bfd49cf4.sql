-- Create specific missing entries for the most common cases

DO $$
DECLARE
  total_added INTEGER := 0;
  company_id_var UUID := '2da00486-874e-41ef-b8d4-07f3ae20868a';
  
  -- April 2025 journal entry
  april_journal_id UUID;
  may_journal_id UUID;
  june_journal_id UUID;
  
  cow_record RECORD;
  monthly_depreciation NUMERIC;
BEGIN
  -- Get existing journal entries
  SELECT id INTO april_journal_id FROM public.journal_entries 
  WHERE company_id = company_id_var AND month = 4 AND year = 2025 AND entry_type = 'depreciation';
  
  SELECT id INTO may_journal_id FROM public.journal_entries 
  WHERE company_id = company_id_var AND month = 5 AND year = 2025 AND entry_type = 'depreciation';
  
  SELECT id INTO june_journal_id FROM public.journal_entries 
  WHERE company_id = company_id_var AND month = 6 AND year = 2025 AND entry_type = 'depreciation';
  
  -- Create missing journal entries
  IF april_journal_id IS NULL THEN
    INSERT INTO public.journal_entries (
      company_id, entry_date, month, year, entry_type, description, total_amount
    ) VALUES (
      company_id_var, '2025-04-30', 4, 2025, 'depreciation', 'Monthly Depreciation - 2025-04', 0
    ) RETURNING id INTO april_journal_id;
  END IF;
  
  IF june_journal_id IS NULL THEN
    INSERT INTO public.journal_entries (
      company_id, entry_date, month, year, entry_type, description, total_amount
    ) VALUES (
      company_id_var, '2025-06-30', 6, 2025, 'depreciation', 'Monthly Depreciation - 2025-06', 0
    ) RETURNING id INTO june_journal_id;
  END IF;
  
  -- Process cows disposed in May (missing April)
  FOR cow_record IN
    SELECT c.id, c.tag_number, c.purchase_price, c.salvage_value, cd.disposition_date
    FROM public.cows c
    JOIN public.cow_dispositions cd ON cd.cow_id = c.id
    WHERE cd.disposition_date >= '2025-05-01' AND cd.disposition_date < '2025-06-01'
      AND c.freshen_date < '2025-04-01'  -- Freshened before April
      AND NOT EXISTS (
        SELECT 1 FROM public.journal_lines jl
        JOIN public.journal_entries je ON je.id = jl.journal_entry_id
        WHERE jl.cow_id = c.id AND je.month = 4 AND je.year = 2025 AND je.entry_type = 'depreciation'
      )
  LOOP
    monthly_depreciation := ROUND((cow_record.purchase_price - cow_record.salvage_value) / (5 * 12), 2);
    
    -- Add April 2025 entries
    INSERT INTO public.journal_lines (
      journal_entry_id, account_code, account_name, description, debit_amount, credit_amount, line_type, cow_id
    ) VALUES (
      april_journal_id, '6100', 'Depreciation Expense',
      'Monthly depreciation - Cow #' || cow_record.tag_number || ' (Apr 2025) - Catchup',
      monthly_depreciation, 0, 'debit', cow_record.id
    );
    
    INSERT INTO public.journal_lines (
      journal_entry_id, account_code, account_name, description, debit_amount, credit_amount, line_type, cow_id
    ) VALUES (
      april_journal_id, '1500.1', 'Accumulated Depreciation - Dairy Cows',
      'Monthly depreciation - Cow #' || cow_record.tag_number || ' (Apr 2025) - Catchup',
      0, monthly_depreciation, 'credit', cow_record.id
    );
    
    UPDATE public.journal_entries SET total_amount = total_amount + monthly_depreciation WHERE id = april_journal_id;
    total_added := total_added + 1;
  END LOOP;
  
  -- Process cows disposed in June (missing April and May)
  FOR cow_record IN
    SELECT c.id, c.tag_number, c.purchase_price, c.salvage_value, cd.disposition_date
    FROM public.cows c
    JOIN public.cow_dispositions cd ON cd.cow_id = c.id
    WHERE cd.disposition_date >= '2025-06-01' AND cd.disposition_date < '2025-07-01'
      AND c.freshen_date < '2025-04-01'  -- Freshened before April
  LOOP
    monthly_depreciation := ROUND((cow_record.purchase_price - cow_record.salvage_value) / (5 * 12), 2);
    
    -- Add April 2025 if missing
    IF NOT EXISTS (
      SELECT 1 FROM public.journal_lines jl
      JOIN public.journal_entries je ON je.id = jl.journal_entry_id
      WHERE jl.cow_id = cow_record.id AND je.month = 4 AND je.year = 2025 AND je.entry_type = 'depreciation'
    ) THEN
      INSERT INTO public.journal_lines (
        journal_entry_id, account_code, account_name, description, debit_amount, credit_amount, line_type, cow_id
      ) VALUES (
        april_journal_id, '6100', 'Depreciation Expense',
        'Monthly depreciation - Cow #' || cow_record.tag_number || ' (Apr 2025) - Catchup',
        monthly_depreciation, 0, 'debit', cow_record.id
      );
      
      INSERT INTO public.journal_lines (
        journal_entry_id, account_code, account_name, description, debit_amount, credit_amount, line_type, cow_id
      ) VALUES (
        april_journal_id, '1500.1', 'Accumulated Depreciation - Dairy Cows',
        'Monthly depreciation - Cow #' || cow_record.tag_number || ' (Apr 2025) - Catchup',
        0, monthly_depreciation, 'credit', cow_record.id
      );
      
      UPDATE public.journal_entries SET total_amount = total_amount + monthly_depreciation WHERE id = april_journal_id;
      total_added := total_added + 1;
    END IF;
    
    -- Add May 2025 if missing and already exists in May entry
    IF may_journal_id IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM public.journal_lines jl
      WHERE jl.journal_entry_id = may_journal_id AND jl.cow_id = cow_record.id
    ) THEN
      INSERT INTO public.journal_lines (
        journal_entry_id, account_code, account_name, description, debit_amount, credit_amount, line_type, cow_id
      ) VALUES (
        may_journal_id, '6100', 'Depreciation Expense',
        'Monthly depreciation - Cow #' || cow_record.tag_number || ' (May 2025) - Catchup',
        monthly_depreciation, 0, 'debit', cow_record.id
      );
      
      INSERT INTO public.journal_lines (
        journal_entry_id, account_code, account_name, description, debit_amount, credit_amount, line_type, cow_id
      ) VALUES (
        may_journal_id, '1500.1', 'Accumulated Depreciation - Dairy Cows',
        'Monthly depreciation - Cow #' || cow_record.tag_number || ' (May 2025) - Catchup',
        0, monthly_depreciation, 'credit', cow_record.id
      );
      
      UPDATE public.journal_entries SET total_amount = total_amount + monthly_depreciation WHERE id = may_journal_id;
      total_added := total_added + 1;
    END IF;
  END LOOP;
  
  RAISE NOTICE 'Added % missing depreciation entries', total_added;
END $$;