-- Clear deceased disposition journal entries to allow recreation with updated logic

-- First, delete journal lines for deceased dispositions
DELETE FROM journal_lines 
WHERE journal_entry_id IN (
  SELECT je.id 
  FROM journal_entries je
  JOIN cow_dispositions cd ON cd.journal_entry_id = je.id
  WHERE cd.disposition_type = 'death'
);

-- Delete journal entries for deceased dispositions
DELETE FROM journal_entries 
WHERE id IN (
  SELECT cd.journal_entry_id 
  FROM cow_dispositions cd 
  WHERE cd.disposition_type = 'death' 
    AND cd.journal_entry_id IS NOT NULL
);

-- Clear journal_entry_id from deceased dispositions
UPDATE cow_dispositions 
SET journal_entry_id = NULL 
WHERE disposition_type = 'death';