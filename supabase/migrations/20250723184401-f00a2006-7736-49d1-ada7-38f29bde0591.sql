-- Truncate all data tables for fresh start
-- Order matters to avoid foreign key constraint violations

-- First, truncate dependent tables
TRUNCATE TABLE public.journal_lines CASCADE;
TRUNCATE TABLE public.journal_entries CASCADE;
TRUNCATE TABLE public.cow_dispositions CASCADE;
TRUNCATE TABLE public.master_file_staging CASCADE;
TRUNCATE TABLE public.balance_adjustments CASCADE;
TRUNCATE TABLE public.monthly_processing_log CASCADE;

-- Then truncate main data tables
TRUNCATE TABLE public.cows CASCADE;

-- Reset any sequences if needed
-- Note: UUIDs don't use sequences, so no need to reset