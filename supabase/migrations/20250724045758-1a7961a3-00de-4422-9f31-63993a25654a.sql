-- Truncate all cow-related data for clean re-upload test
-- This will allow us to test the new synchronous acquisition journal creation

-- Delete in proper order to respect foreign key constraints
DELETE FROM journal_lines 
WHERE journal_entry_id IN (
  SELECT id FROM journal_entries 
  WHERE company_id = '2da00486-874e-41ef-b8d4-07f3ae20868a'
);

DELETE FROM journal_entries 
WHERE company_id = '2da00486-874e-41ef-b8d4-07f3ae20868a';

DELETE FROM cow_dispositions 
WHERE company_id = '2da00486-874e-41ef-b8d4-07f3ae20868a';

DELETE FROM monthly_processing_log 
WHERE company_id = '2da00486-874e-41ef-b8d4-07f3ae20868a';

DELETE FROM master_file_staging 
WHERE company_id = '2da00486-874e-41ef-b8d4-07f3ae20868a';

DELETE FROM balance_adjustments 
WHERE company_id = '2da00486-874e-41ef-b8d4-07f3ae20868a';

DELETE FROM cows 
WHERE company_id = '2da00486-874e-41ef-b8d4-07f3ae20868a';

-- Verify cleanup
SELECT 
  'cows' as table_name, COUNT(*) as remaining_records 
FROM cows 
WHERE company_id = '2da00486-874e-41ef-b8d4-07f3ae20868a'
UNION ALL
SELECT 
  'journal_entries' as table_name, COUNT(*) as remaining_records 
FROM journal_entries 
WHERE company_id = '2da00486-874e-41ef-b8d4-07f3ae20868a'
UNION ALL
SELECT 
  'journal_lines' as table_name, COUNT(*) as remaining_records 
FROM journal_lines jl
JOIN journal_entries je ON je.id = jl.journal_entry_id
WHERE je.company_id = '2da00486-874e-41ef-b8d4-07f3ae20868a';