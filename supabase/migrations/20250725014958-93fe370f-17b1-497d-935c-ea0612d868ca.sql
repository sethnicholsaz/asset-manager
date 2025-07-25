-- Truncate cow-related tables in the correct order to handle dependencies

-- First, truncate tables that reference cows
TRUNCATE TABLE public.cow_dispositions CASCADE;
TRUNCATE TABLE public.master_file_staging CASCADE;

-- Truncate journal lines that might reference cows
DELETE FROM public.journal_lines WHERE cow_id IS NOT NULL;

-- Truncate the main cows table
TRUNCATE TABLE public.cows CASCADE;

-- Reset any sequences if needed and log the action
INSERT INTO public.system_logs (level, message, data)
VALUES (
  'INFO',
  'Cow tables truncated',
  jsonb_build_object(
    'action', 'truncate_cow_tables',
    'timestamp', now(),
    'tables', jsonb_build_array('cows', 'cow_dispositions', 'master_file_staging', 'journal_lines (cow references)')
  )
);