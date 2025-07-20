-- Update the existing posted depreciation journal entries to trigger the cow depreciation updates
-- Since we can't call the trigger function directly, we'll update the existing entries to fire the trigger

UPDATE stored_journal_entries 
SET updated_at = now() 
WHERE entry_type = 'depreciation' AND status = 'posted';