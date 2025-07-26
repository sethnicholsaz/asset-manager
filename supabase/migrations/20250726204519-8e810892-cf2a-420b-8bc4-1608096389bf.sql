-- Truncate all cows and journal data
-- Delete in order to respect foreign key constraints

-- First, truncate journal lines (they reference journal entries)
TRUNCATE public.journal_lines CASCADE;

-- Then truncate journal entries
TRUNCATE public.journal_entries CASCADE;

-- Truncate cow dispositions (they reference cows)
TRUNCATE public.cow_dispositions CASCADE;

-- Truncate master file staging
TRUNCATE public.master_file_staging CASCADE;

-- Truncate processing logs
TRUNCATE public.monthly_processing_log CASCADE;

-- Truncate balance adjustments
TRUNCATE public.balance_adjustments CASCADE;

-- Finally, truncate cows
TRUNCATE public.cows CASCADE;