-- Remove the invalid July 31st depreciation entry for cow #41300 that was disposed on July 26th
DELETE FROM public.journal_lines 
WHERE journal_entry_id IN (
  SELECT je.id
  FROM public.journal_entries je
  JOIN public.journal_lines jl ON jl.journal_entry_id = je.id
  WHERE je.entry_type = 'depreciation'
    AND je.entry_date = '2025-07-31'
    AND jl.cow_id = 'cow_1753561788033_4'  -- Cow #41300
);

-- Remove the empty journal entry
DELETE FROM public.journal_entries 
WHERE entry_type = 'depreciation'
  AND entry_date = '2025-07-31'
  AND NOT EXISTS (
    SELECT 1 FROM public.journal_lines jl 
    WHERE jl.journal_entry_id = journal_entries.id
  );