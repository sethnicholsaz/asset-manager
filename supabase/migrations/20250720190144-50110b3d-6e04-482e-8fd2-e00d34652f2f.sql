-- Truncate all cow-related data tables to start fresh
-- Order matters due to potential foreign key relationships

-- Clear disposition and staging data first
TRUNCATE TABLE public.cow_dispositions CASCADE;
TRUNCATE TABLE public.master_file_staging CASCADE;

-- Clear journal entries and lines
TRUNCATE TABLE public.journal_lines CASCADE;
TRUNCATE TABLE public.journal_entries CASCADE;

-- Clear balance adjustments
TRUNCATE TABLE public.balance_adjustments CASCADE;

-- Finally clear the main cows table
TRUNCATE TABLE public.cows CASCADE;

-- Reset any sequences if needed (though we're using UUIDs mostly)
-- This ensures clean slate for all cow-related data