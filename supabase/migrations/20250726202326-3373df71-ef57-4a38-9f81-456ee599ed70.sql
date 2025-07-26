-- Create specific reversal for cow #41408's invalid May 31st depreciation
DO $$
DECLARE
    new_journal_entry_id UUID;
BEGIN
    -- Create reversal journal entry for cow #41408
    INSERT INTO public.journal_entries (
        company_id, entry_date, month, year, entry_type, description, total_amount
    ) VALUES (
        '2da00486-874e-41ef-b8d4-07f3ae20868a',
        CURRENT_DATE,
        EXTRACT(MONTH FROM CURRENT_DATE),
        EXTRACT(YEAR FROM CURRENT_DATE),
        'depreciation',
        'REVERSAL: Monthly Depreciation - May 2025 for Cow #41408 (Entry after disposition on 2025-05-15)',
        29.9153333333333333
    ) RETURNING id INTO new_journal_entry_id;
    
    -- Create reversing journal lines (swap debits and credits from original May 31st entry)
    
    -- Reverse the credit to Accumulated Depreciation (make it a debit)
    INSERT INTO public.journal_lines (
        journal_entry_id, account_code, account_name, description, 
        debit_amount, credit_amount, line_type, cow_id
    ) VALUES (
        new_journal_entry_id,
        '1500.1',
        'Accumulated Depreciation - Dairy Cows',
        'REVERSAL: Monthly depreciation - Cow #41408 (invalid May 31st entry)',
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
        new_journal_entry_id,
        '6100',
        'Depreciation Expense',
        'REVERSAL: Monthly depreciation - Cow #41408 (invalid May 31st entry)',
        0,
        29.9153333333333333, -- Was debit, now credit
        'credit',
        'cow_1753560868173_9'
    );
    
    RAISE NOTICE 'Created reversal entry for cow #41408 invalid May depreciation';
END $$;