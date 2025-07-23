-- Clear and regenerate disposition journal entries for May 2025
-- Delete all existing disposition journal entries and their lines for May 2025

-- Step 1: Delete all journal lines for disposition entries in May 2025
DELETE FROM journal_lines 
WHERE journal_entry_id IN (
  SELECT id FROM journal_entries 
  WHERE company_id = '2da00486-874e-41ef-b8d4-07f3ae20868a'
    AND entry_type = 'disposition'
    AND month = 5
    AND year = 2025
);

-- Step 2: Delete the journal entries themselves for May 2025
DELETE FROM journal_entries 
WHERE company_id = '2da00486-874e-41ef-b8d4-07f3ae20868a'
  AND entry_type = 'disposition'
  AND month = 5
  AND year = 2025;

-- Step 3: Clear journal_entry_id from dispositions in May 2025
UPDATE cow_dispositions 
SET journal_entry_id = NULL
WHERE company_id = '2da00486-874e-41ef-b8d4-07f3ae20868a'
  AND disposition_date >= '2025-05-01'
  AND disposition_date <= '2025-05-31';