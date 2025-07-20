-- Delete existing journal entries for June and July 2025
DELETE FROM stored_journal_lines 
WHERE journal_entry_id IN (
  SELECT id FROM stored_journal_entries 
  WHERE company_id = '2da00486-874e-41ef-b8d4-07f3ae20868a'
    AND ((month = 6 AND year = 2025) OR (month = 7 AND year = 2025))
);

DELETE FROM stored_journal_entries 
WHERE company_id = '2da00486-874e-41ef-b8d4-07f3ae20868a'
  AND ((month = 6 AND year = 2025) OR (month = 7 AND year = 2025));