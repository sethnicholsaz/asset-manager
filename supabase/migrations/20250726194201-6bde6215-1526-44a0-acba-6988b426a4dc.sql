-- Truncate all data for company 2da00486-874e-41ef-b8d4-07f3ae20868a and start fresh
-- This preserves settings but removes all cows, journal entries, and dispositions

-- First, delete journal lines (foreign key constraint)
DELETE FROM journal_lines 
WHERE journal_entry_id IN (
  SELECT id FROM journal_entries 
  WHERE company_id = '2da00486-874e-41ef-b8d4-07f3ae20868a'
);

-- Delete journal entries
DELETE FROM journal_entries 
WHERE company_id = '2da00486-874e-41ef-b8d4-07f3ae20868a';

-- Delete cow dispositions
DELETE FROM cow_dispositions 
WHERE company_id = '2da00486-874e-41ef-b8d4-07f3ae20868a';

-- Delete cows
DELETE FROM cows 
WHERE company_id = '2da00486-874e-41ef-b8d4-07f3ae20868a';

-- Delete balance adjustments
DELETE FROM balance_adjustments 
WHERE company_id = '2da00486-874e-41ef-b8d4-07f3ae20868a';

-- Delete processing logs
DELETE FROM monthly_processing_log 
WHERE company_id = '2da00486-874e-41ef-b8d4-07f3ae20868a';

-- Delete master file staging data
DELETE FROM master_file_staging 
WHERE company_id = '2da00486-874e-41ef-b8d4-07f3ae20868a';

-- Settings tables are preserved:
-- - depreciation_settings
-- - purchase_price_defaults  
-- - acquisition_settings
-- - gl_account_settings
-- - upload_tokens