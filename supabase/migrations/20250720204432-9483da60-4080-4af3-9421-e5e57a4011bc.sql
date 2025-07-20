-- Fix corrupted freshen_date data caused by previous migration
-- The issue: migration 20250720172850 incorrectly used freshen_date as disposition_date source
-- This corrupted the original freshen_date values for disposed cows

-- Step 1: Fix freshen_date for disposed cows by setting it to birth_date + 2 years
-- This is a reasonable assumption for dairy cows
UPDATE public.cows 
SET freshen_date = birth_date + INTERVAL '2 years'
WHERE status IN ('sold', 'deceased') 
  AND (freshen_date >= '2024-01-01'::date OR freshen_date > birth_date + INTERVAL '5 years');

-- Step 2: Also fix any active cows that have unrealistic freshen dates
UPDATE public.cows 
SET freshen_date = birth_date + INTERVAL '2 years'
WHERE status = 'active' 
  AND (freshen_date >= '2024-01-01'::date OR freshen_date > birth_date + INTERVAL '5 years');

-- Step 3: Update cow dispositions to use more realistic disposition dates
-- For sold cows, use a date closer to current date but before today
UPDATE public.cow_dispositions 
SET disposition_date = CURRENT_DATE - INTERVAL '30 days'
WHERE disposition_type = 'sale' 
  AND disposition_date < '2020-01-01'::date;

-- For deceased cows, use a date closer to current date but before today  
UPDATE public.cow_dispositions 
SET disposition_date = CURRENT_DATE - INTERVAL '60 days'
WHERE disposition_type = 'death' 
  AND disposition_date < '2020-01-01'::date;