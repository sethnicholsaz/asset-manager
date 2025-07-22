-- Clear incorrect journal entries and fix the trigger

-- Delete journal entries that were created after the disposition date for cow 38333
DELETE FROM journal_lines 
WHERE journal_entry_id IN (
  SELECT je.id FROM journal_entries je
  WHERE je.company_id = '2da00486-874e-41ef-b8d4-07f3ae20868a'
    AND je.entry_type = 'depreciation'
    AND je.entry_date > '2025-03-31'
    AND EXISTS (
      SELECT 1 FROM journal_lines jl 
      WHERE jl.journal_entry_id = je.id 
        AND jl.cow_id = 'cow_1753063754036_473'
    )
);

DELETE FROM journal_entries 
WHERE company_id = '2da00486-874e-41ef-b8d4-07f3ae20868a'
  AND entry_type = 'depreciation'
  AND entry_date > '2025-03-31'
  AND EXISTS (
    SELECT 1 FROM journal_lines jl 
    WHERE jl.journal_entry_id = journal_entries.id 
      AND jl.cow_id = 'cow_1753063754036_473'
  );

-- Create disposition journal entry for cow 38333
DO $$
DECLARE
  disposition_id UUID;
BEGIN
  -- Get the disposition ID for cow 38333
  SELECT id INTO disposition_id 
  FROM cow_dispositions cd
  JOIN cows c ON c.id = cd.cow_id
  WHERE c.tag_number = '38333' 
    AND c.company_id = '2da00486-874e-41ef-b8d4-07f3ae20868a';
  
  -- Process the disposition journal if found
  IF disposition_id IS NOT NULL THEN
    PERFORM process_disposition_journal(disposition_id);
  END IF;
END $$;