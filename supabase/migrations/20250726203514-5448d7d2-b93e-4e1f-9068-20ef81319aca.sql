-- Clean up invalid depreciation entries that occur after cow disposition dates
-- This specifically targets the May 31, 2025 entry for cow #41298 that was disposed on May 15, 2025

-- Step 1: Delete journal lines for depreciation entries that occur after disposition
DELETE FROM public.journal_lines 
WHERE journal_entry_id IN (
  SELECT je.id
  FROM public.journal_entries je
  JOIN public.journal_lines jl ON jl.journal_entry_id = je.id
  JOIN public.cow_dispositions cd ON cd.cow_id = jl.cow_id
  WHERE je.entry_type = 'depreciation'
    AND je.entry_date > cd.disposition_date
    AND jl.cow_id IS NOT NULL
);

-- Step 2: Delete the empty journal entries
DELETE FROM public.journal_entries 
WHERE entry_type = 'depreciation'
  AND NOT EXISTS (
    SELECT 1 FROM public.journal_lines jl 
    WHERE jl.journal_entry_id = journal_entries.id
  );

-- Step 3: Also clean up any monthly processing logs for periods after disposition
DELETE FROM public.monthly_processing_log
WHERE id IN (
  SELECT mpl.id
  FROM public.monthly_processing_log mpl
  JOIN public.cows c ON c.company_id = mpl.company_id
  JOIN public.cow_dispositions cd ON cd.cow_id = c.id
  WHERE mpl.entry_type = 'depreciation'
    AND (mpl.processing_year > EXTRACT(YEAR FROM cd.disposition_date) 
         OR (mpl.processing_year = EXTRACT(YEAR FROM cd.disposition_date) 
             AND mpl.processing_month > EXTRACT(MONTH FROM cd.disposition_date)))
);