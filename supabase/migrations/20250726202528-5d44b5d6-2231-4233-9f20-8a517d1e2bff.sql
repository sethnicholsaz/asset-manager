-- Remove July reversal entries and add them to May 2025 instead
DO $$
DECLARE
    july_journal_id UUID;
    may_journal_id UUID;
BEGIN
    -- Get the July 2025 depreciation journal entry
    SELECT id INTO july_journal_id
    FROM public.journal_entries
    WHERE company_id = '2da00486-874e-41ef-b8d4-07f3ae20868a'
      AND month = 7 
      AND year = 2025 
      AND entry_type = 'depreciation';
    
    -- Get the May 2025 depreciation journal entry  
    SELECT id INTO may_journal_id
    FROM public.journal_entries
    WHERE company_id = '2da00486-874e-41ef-b8d4-07f3ae20868a'
      AND month = 5 
      AND year = 2025 
      AND entry_type = 'depreciation';
    
    IF july_journal_id IS NULL OR may_journal_id IS NULL THEN
        RAISE EXCEPTION 'Could not find required journal entries';
    END IF;
    
    -- Remove the reversal lines from July entry
    DELETE FROM public.journal_lines 
    WHERE journal_entry_id = july_journal_id 
      AND cow_id = 'cow_1753560868173_9'
      AND description LIKE '%REVERSAL%';
    
    -- Update July entry total amount (subtract the reversal amount)
    UPDATE public.journal_entries 
    SET total_amount = total_amount - 29.9153333333333333
    WHERE id = july_journal_id;
    
    -- Add reversal lines to May 2025 entry instead
    
    -- Reverse the credit to Accumulated Depreciation (make it a debit)
    INSERT INTO public.journal_lines (
        journal_entry_id, account_code, account_name, description, 
        debit_amount, credit_amount, line_type, cow_id
    ) VALUES (
        may_journal_id,
        '1500.1',
        'Accumulated Depreciation - Dairy Cows',
        'REVERSAL: Invalid May 31st depreciation - Cow #41408 (disposed May 15th)',
        29.9153333333333333,
        0,
        'debit',
        'cow_1753560868173_9'
    );
    
    -- Reverse the debit to Depreciation Expense (make it a credit)
    INSERT INTO public.journal_lines (
        may_journal_id, account_code, account_name, description, 
        debit_amount, credit_amount, line_type, cow_id
    ) VALUES (
        may_journal_id,
        '6100',
        'Depreciation Expense',
        'REVERSAL: Invalid May 31st depreciation - Cow #41408 (disposed May 15th)',
        0,
        29.9153333333333333,
        'credit',
        'cow_1753560868173_9'
    );
    
    -- Update May entry total amount to reflect the additional reversal lines
    UPDATE public.journal_entries 
    SET total_amount = total_amount + 29.9153333333333333
    WHERE id = may_journal_id;
    
    RAISE NOTICE 'Moved reversal lines from July to May 2025 for proper historical dating';
END $$;