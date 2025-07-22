-- Truncate journal tables to start fresh and test the fixes

-- First, delete all journal lines (references journal entries)
DELETE FROM journal_lines;

-- Then delete all journal entries
DELETE FROM journal_entries;

-- Clear processing logs to allow fresh processing
DELETE FROM monthly_processing_log;

-- Reset cow depreciation values so they get recalculated properly
UPDATE cows 
SET 
  total_depreciation = 0,
  current_value = CASE 
    WHEN status IN ('sold', 'deceased') THEN 0 
    ELSE purchase_price 
  END
WHERE company_id = '2da00486-874e-41ef-b8d4-07f3ae20868a';

-- Clear journal entry references from dispositions so they can be recreated
UPDATE cow_dispositions 
SET journal_entry_id = NULL 
WHERE company_id = '2da00486-874e-41ef-b8d4-07f3ae20868a';