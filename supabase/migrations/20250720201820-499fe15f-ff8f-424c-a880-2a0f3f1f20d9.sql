-- Truncate cow-related tables to start fresh with clean data
-- This will remove all cow data and related dispositions/journal entries

-- First, truncate journal lines (child table)
TRUNCATE TABLE public.stored_journal_lines CASCADE;

-- Then truncate journal entries 
TRUNCATE TABLE public.stored_journal_entries CASCADE;

-- Truncate cow dispositions
TRUNCATE TABLE public.cow_dispositions CASCADE;

-- Finally, truncate the main cows table
TRUNCATE TABLE public.cows CASCADE;

-- Also truncate any staging data
TRUNCATE TABLE public.master_file_staging CASCADE;