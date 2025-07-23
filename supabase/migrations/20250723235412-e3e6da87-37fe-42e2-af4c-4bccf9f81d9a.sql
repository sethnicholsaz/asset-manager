-- Clear and regenerate disposition journal entries for multiple months in 2025
-- This will fix the unbalanced account summaries

-- Clear January 2025 disposition journals
DELETE FROM journal_lines 
WHERE journal_entry_id IN (
  SELECT id FROM journal_entries 
  WHERE company_id = '2da00486-874e-41ef-b8d4-07f3ae20868a'
    AND entry_type = 'disposition'
    AND month = 1 AND year = 2025
);

DELETE FROM journal_entries 
WHERE company_id = '2da00486-874e-41ef-b8d4-07f3ae20868a'
  AND entry_type = 'disposition'
  AND month = 1 AND year = 2025;

UPDATE cow_dispositions 
SET journal_entry_id = NULL
WHERE company_id = '2da00486-874e-41ef-b8d4-07f3ae20868a'
  AND disposition_date >= '2025-01-01' AND disposition_date <= '2025-01-31';

-- Clear February 2025 disposition journals
DELETE FROM journal_lines 
WHERE journal_entry_id IN (
  SELECT id FROM journal_entries 
  WHERE company_id = '2da00486-874e-41ef-b8d4-07f3ae20868a'
    AND entry_type = 'disposition'
    AND month = 2 AND year = 2025
);

DELETE FROM journal_entries 
WHERE company_id = '2da00486-874e-41ef-b8d4-07f3ae20868a'
  AND entry_type = 'disposition'
  AND month = 2 AND year = 2025;

UPDATE cow_dispositions 
SET journal_entry_id = NULL
WHERE company_id = '2da00486-874e-41ef-b8d4-07f3ae20868a'
  AND disposition_date >= '2025-02-01' AND disposition_date <= '2025-02-28';

-- Clear March 2025 disposition journals
DELETE FROM journal_lines 
WHERE journal_entry_id IN (
  SELECT id FROM journal_entries 
  WHERE company_id = '2da00486-874e-41ef-b8d4-07f3ae20868a'
    AND entry_type = 'disposition'
    AND month = 3 AND year = 2025
);

DELETE FROM journal_entries 
WHERE company_id = '2da00486-874e-41ef-b8d4-07f3ae20868a'
  AND entry_type = 'disposition'
  AND month = 3 AND year = 2025;

UPDATE cow_dispositions 
SET journal_entry_id = NULL
WHERE company_id = '2da00486-874e-41ef-b8d4-07f3ae20868a'
  AND disposition_date >= '2025-03-01' AND disposition_date <= '2025-03-31';

-- Clear June 2025 disposition journals
DELETE FROM journal_lines 
WHERE journal_entry_id IN (
  SELECT id FROM journal_entries 
  WHERE company_id = '2da00486-874e-41ef-b8d4-07f3ae20868a'
    AND entry_type = 'disposition'
    AND month = 6 AND year = 2025
);

DELETE FROM journal_entries 
WHERE company_id = '2da00486-874e-41ef-b8d4-07f3ae20868a'
  AND entry_type = 'disposition'
  AND month = 6 AND year = 2025;

UPDATE cow_dispositions 
SET journal_entry_id = NULL
WHERE company_id = '2da00486-874e-41ef-b8d4-07f3ae20868a'
  AND disposition_date >= '2025-06-01' AND disposition_date <= '2025-06-30';