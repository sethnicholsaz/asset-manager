-- Fix the timing issue: Remove depreciation entries that were created BEFORE disposition entries
-- for the same cow in the same month

-- Step 1: Delete invalid depreciation journal lines created before disposition
DELETE FROM public.journal_lines 
WHERE journal_entry_id IN (
  SELECT DISTINCT dep_je.id
  FROM public.journal_entries dep_je
  JOIN public.journal_lines dep_jl ON dep_jl.journal_entry_id = dep_je.id
  JOIN public.journal_entries disp_je ON disp_je.company_id = dep_je.company_id
  JOIN public.journal_lines disp_jl ON disp_jl.journal_entry_id = disp_je.id
  WHERE dep_je.entry_type = 'depreciation'
    AND disp_je.entry_type = 'disposition'
    AND dep_jl.cow_id = disp_jl.cow_id
    AND EXTRACT(YEAR FROM dep_je.entry_date) = EXTRACT(YEAR FROM disp_je.entry_date)
    AND EXTRACT(MONTH FROM dep_je.entry_date) = EXTRACT(MONTH FROM disp_je.entry_date)
    AND dep_je.created_at < disp_je.created_at  -- Depreciation created before disposition
    AND dep_je.entry_date >= disp_je.entry_date -- But depreciation date is after/same as disposition date
);

-- Step 2: Delete the empty journal entries
DELETE FROM public.journal_entries 
WHERE entry_type = 'depreciation'
  AND NOT EXISTS (
    SELECT 1 FROM public.journal_lines jl 
    WHERE jl.journal_entry_id = journal_entries.id
  );