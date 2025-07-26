-- Truncate cow data and journal entries while preserving settings
-- This will delete all cow records, dispositions, journal entries, and related data
-- but keep company settings, users, and configuration intact

-- Disable triggers temporarily to avoid constraint issues
SET session_replication_role = replica;

-- Truncate in correct order to handle foreign key dependencies
TRUNCATE TABLE public.journal_lines CASCADE;
TRUNCATE TABLE public.journal_entries CASCADE;
TRUNCATE TABLE public.cow_dispositions CASCADE;
TRUNCATE TABLE public.cows CASCADE;
TRUNCATE TABLE public.monthly_processing_log CASCADE;
TRUNCATE TABLE public.master_file_staging CASCADE;

-- Re-enable triggers
SET session_replication_role = DEFAULT;

-- Log the truncation
INSERT INTO public.system_logs (level, message, data) 
VALUES ('INFO', 'Data truncation completed', jsonb_build_object(
  'action', 'truncate_cow_data',
  'tables_cleared', array[
    'journal_lines',
    'journal_entries', 
    'cow_dispositions',
    'cows',
    'monthly_processing_log',
    'master_file_staging'
  ],
  'timestamp', now()
));

-- Reset sequences if they exist
DO $$
DECLARE
    seq_record RECORD;
BEGIN
    -- Reset any sequences associated with truncated tables
    FOR seq_record IN 
        SELECT schemaname, sequencename 
        FROM pg_sequences 
        WHERE schemaname = 'public'
    LOOP
        EXECUTE format('ALTER SEQUENCE %I.%I RESTART WITH 1', seq_record.schemaname, seq_record.sequencename);
    END LOOP;
END $$;