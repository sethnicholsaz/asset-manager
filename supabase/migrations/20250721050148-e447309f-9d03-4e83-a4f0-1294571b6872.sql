-- Clean up journal entry tables that are no longer needed
-- These were causing complexity and performance issues

-- Drop the journal entry tables
DROP TABLE IF EXISTS public.journal_lines CASCADE;
DROP TABLE IF EXISTS public.journal_entries CASCADE;
DROP TABLE IF EXISTS public.stored_journal_lines CASCADE;
DROP TABLE IF EXISTS public.stored_journal_entries CASCADE;
DROP TABLE IF EXISTS public.cow_monthly_depreciation CASCADE;

-- Drop any functions that reference these tables
DROP FUNCTION IF EXISTS public.update_cow_depreciation() CASCADE;