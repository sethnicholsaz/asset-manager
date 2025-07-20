-- Truncate all cow-related tables to start fresh with clean data
-- This will remove all cow data and related records

-- First, truncate child tables that reference parent tables
TRUNCATE TABLE public.stored_journal_lines CASCADE;
TRUNCATE TABLE public.stored_journal_entries CASCADE;
TRUNCATE TABLE public.journal_lines CASCADE;
TRUNCATE TABLE public.journal_entries CASCADE;
TRUNCATE TABLE public.cow_dispositions CASCADE;
TRUNCATE TABLE public.balance_adjustments CASCADE;
TRUNCATE TABLE public.master_file_staging CASCADE;

-- Finally, truncate the main cows table
TRUNCATE TABLE public.cows CASCADE;