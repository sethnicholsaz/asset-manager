-- Truncate cows and cow_dispositions tables to start fresh
TRUNCATE TABLE public.cows CASCADE;
TRUNCATE TABLE public.cow_dispositions CASCADE;

-- Also clear any related staging data
TRUNCATE TABLE public.master_file_staging CASCADE;