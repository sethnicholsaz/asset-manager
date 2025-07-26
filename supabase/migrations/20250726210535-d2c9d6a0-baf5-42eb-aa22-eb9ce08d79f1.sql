-- Add cow #28631 to existing May 2025 depreciation entry and create June entry if needed

DO $$
DECLARE
  cow_28631_id TEXT := 'cow_1753563428349_809';
  may_journal_id UUID := '71bdcfb8-6a4a-4dbd-9c60-7940bb45aafb';
  june_journal_id UUID;
  june_entry_exists BOOLEAN;
BEGIN
  -- Add cow #28631 to existing May 2025 depreciation entry
  -- Check if cow #28631 already has lines in May 2025 entry
  IF NOT EXISTS (
    SELECT 1 FROM public.journal_lines 
    WHERE journal_entry_id = may_journal_id 
      AND cow_id = cow_28631_id
  ) THEN
    -- Add depreciation expense line (debit)
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
    
    -- Add accumulated depreciation line (credit)
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
    
    -- Update the journal entry total amount
    UPDATE public.journal_entries 
    SET total_amount = total_amount + 24.75
    WHERE id = may_journal_id;
  END IF;
  
  -- Check if June 2025 depreciation entry exists
  SELECT EXISTS (
    SELECT 1 FROM public.journal_entries 
    WHERE company_id = '2da00486-874e-41ef-b8d4-07f3ae20868a'
      AND month = 6 AND year = 2025 
      AND entry_type = 'depreciation'
  ) INTO june_entry_exists;
  
  IF june_entry_exists THEN
    -- Get the June journal entry ID
    SELECT id INTO june_journal_id
    FROM public.journal_entries 
    WHERE company_id = '2da00486-874e-41ef-b8d4-07f3ae20868a'
      AND month = 6 AND year = 2025 
      AND entry_type = 'depreciation';
    
    -- Add cow #28631 to existing June entry if not already there
    IF NOT EXISTS (
      SELECT 1 FROM public.journal_lines 
      WHERE journal_entry_id = june_journal_id 
        AND cow_id = cow_28631_id
    ) THEN
      -- Add depreciation expense line (debit)
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
      
      -- Add accumulated depreciation line (credit)
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
      
      -- Update the journal entry total amount
      UPDATE public.journal_entries 
      SET total_amount = total_amount + 24.75
      WHERE id = june_journal_id;
    END IF;
  ELSE
    -- Create new June 2025 depreciation entry
    INSERT INTO public.journal_entries (
      company_id, entry_date, month, year, entry_type, description, total_amount
    ) VALUES (
      '2da00486-874e-41ef-b8d4-07f3ae20868a',
      '2025-06-30'::date,
      6,
      2025,
      'depreciation',
      'Monthly Depreciation - 2025-06',
      24.75
    ) RETURNING id INTO june_journal_id;
    
    -- Add depreciation expense line (debit)
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
    
    -- Add accumulated depreciation line (credit)  
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