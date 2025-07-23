-- WARNING: This will permanently delete all cow data, dispositions, and journal entries
-- This operation is irreversible

-- Truncate tables in correct order to handle foreign key constraints
-- Start with dependent tables first

-- Clear journal lines first (depends on journal_entries)
TRUNCATE TABLE public.journal_lines CASCADE;

-- Clear journal entries (depends on companies)
TRUNCATE TABLE public.journal_entries CASCADE;

-- Clear cow dispositions (depends on cows and companies)
TRUNCATE TABLE public.cow_dispositions CASCADE;

-- Clear cows table (main cow data)
TRUNCATE TABLE public.cows CASCADE;

-- Clear staging and processing tables
TRUNCATE TABLE public.master_file_staging CASCADE;
TRUNCATE TABLE public.balance_adjustments CASCADE;
TRUNCATE TABLE public.monthly_processing_log CASCADE;

-- Clear configuration tables that can be rebuilt
TRUNCATE TABLE public.purchase_price_defaults CASCADE;
TRUNCATE TABLE public.upload_tokens CASCADE;

-- Reset any sequences (if using auto-incrementing fields)
-- Note: Most tables use UUIDs, but this ensures clean state

COMMENT ON TABLE public.cows IS 'All data truncated - ready for fresh bulk upload';
COMMENT ON TABLE public.cow_dispositions IS 'All data truncated - ready for fresh bulk upload';
COMMENT ON TABLE public.journal_entries IS 'All data truncated - ready for fresh bulk upload';