-- Truncate all cow-related data for company 71d432ba-89df-4000-ab2b-efad27664fa3
-- Delete in order to respect foreign key constraints

-- 1. Delete cow monthly depreciation records first (references cows)
DELETE FROM public.cow_monthly_depreciation 
WHERE company_id = '71d432ba-89df-4000-ab2b-efad27664fa3';

-- 2. Delete journal lines (references journal_entries)
DELETE FROM public.journal_lines 
WHERE journal_entry_id IN (
  SELECT id FROM public.journal_entries 
  WHERE company_id = '71d432ba-89df-4000-ab2b-efad27664fa3'
);

-- 3. Delete stored journal lines (references stored_journal_entries)
DELETE FROM public.stored_journal_lines 
WHERE journal_entry_id IN (
  SELECT id FROM public.stored_journal_entries 
  WHERE company_id = '71d432ba-89df-4000-ab2b-efad27664fa3'
);

-- 4. Delete cow dispositions
DELETE FROM public.cow_dispositions 
WHERE company_id = '71d432ba-89df-4000-ab2b-efad27664fa3';

-- 5. Delete balance adjustments
DELETE FROM public.balance_adjustments 
WHERE company_id = '71d432ba-89df-4000-ab2b-efad27664fa3';

-- 6. Delete master file staging data
DELETE FROM public.master_file_staging 
WHERE company_id = '71d432ba-89df-4000-ab2b-efad27664fa3';

-- 7. Delete journal entries
DELETE FROM public.journal_entries 
WHERE company_id = '71d432ba-89df-4000-ab2b-efad27664fa3';

-- 8. Delete stored journal entries
DELETE FROM public.stored_journal_entries 
WHERE company_id = '71d432ba-89df-4000-ab2b-efad27664fa3';

-- 9. Finally delete cows (this will cascade to any remaining references)
DELETE FROM public.cows 
WHERE company_id = '71d432ba-89df-4000-ab2b-efad27664fa3';

-- Show the cleanup results
SELECT 
  'cow_monthly_depreciation' as table_name,
  COUNT(*) as remaining_records
FROM public.cow_monthly_depreciation 
WHERE company_id = '71d432ba-89df-4000-ab2b-efad27664fa3'

UNION ALL

SELECT 
  'cow_dispositions' as table_name,
  COUNT(*) as remaining_records
FROM public.cow_dispositions 
WHERE company_id = '71d432ba-89df-4000-ab2b-efad27664fa3'

UNION ALL

SELECT 
  'journal_entries' as table_name,
  COUNT(*) as remaining_records
FROM public.journal_entries 
WHERE company_id = '71d432ba-89df-4000-ab2b-efad27664fa3'

UNION ALL

SELECT 
  'stored_journal_entries' as table_name,
  COUNT(*) as remaining_records
FROM public.stored_journal_entries 
WHERE company_id = '71d432ba-89df-4000-ab2b-efad27664fa3'

UNION ALL

SELECT 
  'cows' as table_name,
  COUNT(*) as remaining_records
FROM public.cows 
WHERE company_id = '71d432ba-89df-4000-ab2b-efad27664fa3';