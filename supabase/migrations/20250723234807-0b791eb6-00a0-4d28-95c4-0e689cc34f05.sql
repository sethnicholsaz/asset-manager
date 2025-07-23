-- Delete all existing disposition journal entries and their lines
-- Then recreate them with the corrected function

-- Step 1: Delete all journal lines for disposition entries
DELETE FROM journal_lines 
WHERE journal_entry_id IN (
  SELECT id FROM journal_entries 
  WHERE company_id = '2da00486-874e-41ef-b8d4-07f3ae20868a'
    AND entry_type = 'disposition'
    AND month = 4
    AND year = 2025
);

-- Step 2: Delete the journal entries themselves
DELETE FROM journal_entries 
WHERE company_id = '2da00486-874e-41ef-b8d4-07f3ae20868a'
  AND entry_type = 'disposition'
  AND month = 4
  AND year = 2025;

-- Step 3: Clear journal_entry_id from dispositions
UPDATE cow_dispositions 
SET journal_entry_id = NULL
WHERE company_id = '2da00486-874e-41ef-b8d4-07f3ae20868a'
  AND disposition_date >= '2025-04-01'
  AND disposition_date <= '2025-04-30';