-- Delete unbalanced disposition entries to regenerate them with correct logic
DELETE FROM stored_journal_lines 
WHERE journal_entry_id IN (
  SELECT id FROM stored_journal_entries 
  WHERE entry_type = 'disposition' 
    AND year = 2025 
    AND month IN (4, 5, 6, 7)
);

DELETE FROM stored_journal_entries 
WHERE entry_type = 'disposition' 
  AND year = 2025 
  AND month IN (4, 5, 6, 7);