-- Add reversal lines to existing July 2025 depreciation entry for cow #41408
DO $$
DECLARE
    july_journal_id UUID;
BEGIN
    -- Get the existing July 2025 depreciation journal entry
    SELECT id INTO july_journal_id
    FROM public.journal_entries
    WHERE company_id = '2da00486-874e-41ef-b8d4-07f3ae20868a'
      AND month = 7 
      AND year = 2025 
      AND entry_type = 'depreciation';
    
    IF july_journal_id IS NULL THEN
        RAISE EXCEPTION 'Could not find July 2025 depreciation journal entry';
    END IF;
    
    -- Add reversal lines for cow #41408's invalid May 31st depreciation
    
    -- Reverse the credit to Accumulated Depreciation (make it a debit)
    INSERT INTO public.journal_lines (
        journal_entry_id, account_code, account_name, description, 
        debit_amount, credit_amount, line_type, cow_id
    ) VALUES (
        july_journal_id,
        '1500.1',
        'Accumulated Depreciation - Dairy Cows',
        'REVERSAL: Invalid May 31st depreciation - Cow #41408 (disposed May 15th)',
        29.9153333333333333, -- Was credit, now debit
        0,
        'debit',
        'cow_1753560868173_9'
    );
    
    -- Reverse the debit to Depreciation Expense (make it a credit)
    INSERT INTO public.journal_lines (
        journal_entry_id, account_code, account_name, description, 
        debit_amount, credit_amount, line_type, cow_id
    ) VALUES (
        july_journal_id,
        '6100',
        'Depreciation Expense',
        'REVERSAL: Invalid May 31st depreciation - Cow #41408 (disposed May 15th)',
        0,
        29.9153333333333333, -- Was debit, now credit
        'credit',
        'cow_1753560868173_9'
    );
    
    -- Update the journal entry total amount to reflect the additional lines
    UPDATE public.journal_entries 
    SET total_amount = total_amount + 29.9153333333333333
    WHERE id = july_journal_id;
    
    RAISE NOTICE 'Added reversal lines to July 2025 depreciation entry for cow #41408';
END $$;