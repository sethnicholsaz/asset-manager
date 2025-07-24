-- Truncate all cow-related data for fresh upload
-- Delete in proper order to avoid foreign key constraint violations

-- Delete journal lines first (they reference journal entries)
DELETE FROM journal_lines WHERE journal_entry_id IN (
  SELECT id FROM journal_entries WHERE company_id = '2da00486-874e-41ef-b8d4-07f3ae20868a'
);

-- Delete journal entries
DELETE FROM journal_entries WHERE company_id = '2da00486-874e-41ef-b8d4-07f3ae20868a';

-- Delete cow dispositions 
DELETE FROM cow_dispositions WHERE company_id = '2da00486-874e-41ef-b8d4-07f3ae20868a';

-- Delete balance adjustments
DELETE FROM balance_adjustments WHERE company_id = '2da00486-874e-41ef-b8d4-07f3ae20868a';

-- Delete monthly processing logs
DELETE FROM monthly_processing_log WHERE company_id = '2da00486-874e-41ef-b8d4-07f3ae20868a';

-- Delete master file staging records
DELETE FROM master_file_staging WHERE company_id = '2da00486-874e-41ef-b8d4-07f3ae20868a';

-- Delete cows last
DELETE FROM cows WHERE company_id = '2da00486-874e-41ef-b8d4-07f3ae20868a';

-- Reset any sequences if needed
-- Note: UUIDs don't need sequence resets

-- Log the cleanup
INSERT INTO monthly_processing_log (
  company_id, 
  processing_month, 
  processing_year, 
  entry_type, 
  status, 
  started_at, 
  completed_at,
  cows_processed,
  total_amount,
  error_message
) VALUES (
  '2da00486-874e-41ef-b8d4-07f3ae20868a',
  EXTRACT(MONTH FROM CURRENT_DATE),
  EXTRACT(YEAR FROM CURRENT_DATE),
  'data_cleanup',
  'completed',
  now(),
  now(),
  0,
  0,
  'All cow data truncated for fresh upload'
);