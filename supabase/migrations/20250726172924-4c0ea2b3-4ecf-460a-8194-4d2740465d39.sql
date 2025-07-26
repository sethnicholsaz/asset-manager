-- Clean up post-disposition depreciation for cow #41331
-- This cow died on 2025-05-01 but has depreciation on 2025-05-31

-- Delete the journal lines for the invalid depreciation entry
DELETE FROM journal_lines 
WHERE journal_entry_id = '2ffbaf3e-0166-4e7c-be9f-5853876a30d8'
  AND cow_id = 'cow_1753547874327_5';

-- Delete the invalid journal entry
DELETE FROM journal_entries 
WHERE id = '2ffbaf3e-0166-4e7c-be9f-5853876a30d8'
  AND entry_date > '2025-05-01'
  AND entry_type = 'depreciation';

-- Update the cow's depreciation values to reflect only valid depreciation (before disposition)
UPDATE cows 
SET 
  total_depreciation = 30.79,  -- Only April depreciation (before death on May 1)
  current_value = 2052.76 - 30.79,  -- Purchase price minus valid depreciation
  updated_at = now()
WHERE id = 'cow_1753547874327_5';