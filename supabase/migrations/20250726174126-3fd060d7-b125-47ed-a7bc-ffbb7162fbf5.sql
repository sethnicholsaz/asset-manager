-- Truncate all cow-related data to start fresh
-- This will remove all cows, dispositions, journal entries, and related data

-- First, delete all journal lines (they reference journal entries)
DELETE FROM public.journal_lines;

-- Delete all journal entries
DELETE FROM public.journal_entries;

-- Delete all cow dispositions
DELETE FROM public.cow_dispositions;

-- Delete all balance adjustments
DELETE FROM public.balance_adjustments;

-- Delete all master file staging records
DELETE FROM public.master_file_staging;

-- Delete all monthly processing logs
DELETE FROM public.monthly_processing_log;

-- Finally, delete all cows
DELETE FROM public.cows;

-- Reset any sequences if needed (though we're using UUIDs mostly)
-- This ensures clean slate for testing