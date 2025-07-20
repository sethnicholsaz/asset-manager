-- Reset any existing balance adjustment journal entries to allow re-processing
-- This will change status from 'posted' back to 'draft' so they can be regenerated

UPDATE stored_journal_entries 
SET status = 'draft', 
    updated_at = now()
WHERE company_id = '2da00486-874e-41ef-b8d4-07f3ae20868a' 
  AND (entry_type LIKE '%balance%' OR entry_type LIKE '%reconcil%' OR entry_type LIKE '%adjustment%');

-- Also reset any balance adjustments that may have been marked as applied
UPDATE balance_adjustments 
SET applied_to_current_month = false,
    journal_entry_id = NULL,
    updated_at = now()
WHERE company_id = '2da00486-874e-41ef-b8d4-07f3ae20868a';