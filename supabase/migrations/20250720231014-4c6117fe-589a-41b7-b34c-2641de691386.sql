-- Reset July 2025 journal entries back to draft status for re-processing
UPDATE stored_journal_entries 
SET status = 'draft', updated_at = now()
WHERE company_id = '2da00486-874e-41ef-b8d4-07f3ae20868a'
  AND month = 7 
  AND year = 2025
  AND status = 'posted';