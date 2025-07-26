-- First, remove the incorrect June 2025 depreciation for disposed cow #41298
-- This entry should never have existed since the cow was disposed on May 15, 2025

DELETE FROM public.journal_lines 
WHERE journal_entry_id IN (
  SELECT je.id 
  FROM public.journal_entries je
  JOIN public.journal_lines jl ON jl.journal_entry_id = je.id
  WHERE je.entry_type = 'depreciation'
    AND je.month = 6
    AND je.year = 2025
    AND jl.cow_id = 'cow_1753562757954_3'
    AND je.company_id = '2da00486-874e-41ef-b8d4-07f3ae20868a'
);

-- Remove any empty journal entries
DELETE FROM public.journal_entries 
WHERE entry_type = 'depreciation'
  AND month = 6
  AND year = 2025
  AND company_id = '2da00486-874e-41ef-b8d4-07f3ae20868a'
  AND NOT EXISTS (
    SELECT 1 FROM public.journal_lines jl 
    WHERE jl.journal_entry_id = journal_entries.id
  );