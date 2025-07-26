-- Clean up the remaining invalid depreciation entries
-- This cow was disposed on May 15, 2025, so should not have May 31 depreciation

-- Delete the invalid May depreciation entries for disposed cows
DELETE FROM public.journal_lines jl
USING public.journal_entries je, public.cow_dispositions cd
WHERE jl.journal_entry_id = je.id
  AND jl.cow_id = cd.cow_id
  AND je.company_id = '2da00486-874e-41ef-b8d4-07f3ae20868a'
  AND je.entry_type = 'depreciation'
  AND je.entry_date >= '2025-05-31'  -- May 31st entries
  AND cd.disposition_date <= '2025-05-15'  -- Disposed by May 15th
  AND jl.cow_id = 'cow_1753559034945_7';  -- Cow #41386

-- Also check for any other cows with the same issue
DELETE FROM public.journal_lines jl
USING public.journal_entries je, public.cow_dispositions cd
WHERE jl.journal_entry_id = je.id
  AND jl.cow_id = cd.cow_id
  AND je.company_id = '2da00486-874e-41ef-b8d4-07f3ae20868a'
  AND je.entry_type = 'depreciation'
  AND je.entry_date > cd.disposition_date;  -- Any depreciation after disposal

-- Clean up empty journal entries
DELETE FROM public.journal_entries je
WHERE je.company_id = '2da00486-874e-41ef-b8d4-07f3ae20868a'
  AND je.entry_type = 'depreciation'
  AND NOT EXISTS (
    SELECT 1 FROM public.journal_lines jl 
    WHERE jl.journal_entry_id = je.id
  );