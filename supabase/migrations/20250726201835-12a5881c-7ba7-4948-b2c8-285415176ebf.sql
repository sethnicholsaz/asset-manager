-- Reverse all future depreciation entries after cow disposition dates with offsetting entries

DO $$
DECLARE
    invalid_entry RECORD;
    invalid_line RECORD;
    new_journal_entry_id UUID;
    reversal_description TEXT;
BEGIN
    -- Find all depreciation journal entries that occur after cow disposition dates
    FOR invalid_entry IN 
        SELECT DISTINCT je.id, je.company_id, je.entry_date, je.month, je.year, je.description, je.total_amount,
               cd.disposition_date, cd.cow_id, c.tag_number
        FROM public.journal_entries je
        JOIN public.journal_lines jl ON jl.journal_entry_id = je.id
        JOIN public.cow_dispositions cd ON cd.cow_id = jl.cow_id
        JOIN public.cows c ON c.id = cd.cow_id
        WHERE je.entry_type = 'depreciation'
          AND je.entry_date > cd.disposition_date
          AND jl.cow_id IS NOT NULL
    LOOP
        -- Create description for reversal entry
        reversal_description := 'REVERSAL: ' || invalid_entry.description || ' (Entry after disposition on ' || invalid_entry.disposition_date || ')';
        
        -- Create reversal journal entry
        INSERT INTO public.journal_entries (
            company_id, entry_date, month, year, entry_type, description, total_amount
        ) VALUES (
            invalid_entry.company_id,
            CURRENT_DATE, -- Use current date for reversal
            EXTRACT(MONTH FROM CURRENT_DATE),
            EXTRACT(YEAR FROM CURRENT_DATE),
            'depreciation',
            reversal_description,
            invalid_entry.total_amount
        ) RETURNING id INTO new_journal_entry_id;
        
        -- Create reversing journal lines for each line in the original entry
        FOR invalid_line IN 
            SELECT jl.account_code, jl.account_name, jl.description, jl.debit_amount, jl.credit_amount, jl.line_type, jl.cow_id
            FROM public.journal_lines jl
            WHERE jl.journal_entry_id = invalid_entry.id
              AND jl.cow_id = invalid_entry.cow_id
        LOOP
            -- Create reversing line (swap debits and credits)
            INSERT INTO public.journal_lines (
                journal_entry_id, account_code, account_name, description, 
                debit_amount, credit_amount, line_type, cow_id
            ) VALUES (
                new_journal_entry_id,
                invalid_line.account_code,
                invalid_line.account_name,
                'REVERSAL: ' || invalid_line.description,
                invalid_line.credit_amount, -- Swap: credit becomes debit
                invalid_line.debit_amount,  -- Swap: debit becomes credit
                CASE WHEN invalid_line.line_type = 'debit' THEN 'credit' ELSE 'debit' END,
                invalid_line.cow_id
            );
        END LOOP;
        
        RAISE NOTICE 'Created reversal entry % for invalid depreciation on cow %', new_journal_entry_id, invalid_entry.tag_number;
        
    END LOOP;
    
    RAISE NOTICE 'Completed reversing invalid depreciation entries';
END $$;