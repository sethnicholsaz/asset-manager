-- Clean up invalid depreciation entries manually
-- Remove depreciation entries that occurred after disposal date

-- Delete journal lines for disposed cows where depreciation date > disposition date
DELETE FROM public.journal_lines jl
USING public.journal_entries je, public.cow_dispositions cd
WHERE jl.journal_entry_id = je.id
  AND jl.cow_id = cd.cow_id
  AND je.company_id = '2da00486-874e-41ef-b8d4-07f3ae20868a'
  AND je.entry_type = 'depreciation'
  AND cd.disposition_date < je.entry_date;

-- Delete any journal entries that are now empty (no journal lines)
DELETE FROM public.journal_entries je
WHERE je.company_id = '2da00486-874e-41ef-b8d4-07f3ae20868a'
  AND je.entry_type = 'depreciation'
  AND NOT EXISTS (
    SELECT 1 FROM public.journal_lines jl 
    WHERE jl.journal_entry_id = je.id
  );