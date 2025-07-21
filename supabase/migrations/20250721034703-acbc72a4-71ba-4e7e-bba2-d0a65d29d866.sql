-- Fix depreciation calculation - clear existing wrong data and mark cows for reprocessing
-- This will remove the artificially limited depreciation and recalculate from actual freshen dates

-- First, delete existing depreciation records and journal entries for the test company
DELETE FROM journal_lines 
WHERE journal_entry_id IN (
  SELECT id FROM journal_entries 
  WHERE company_id = '71d432ba-89df-4000-ab2b-efad27664fa3' 
    AND entry_type = 'depreciation'
);

DELETE FROM journal_entries 
WHERE company_id = '71d432ba-89df-4000-ab2b-efad27664fa3' 
  AND entry_type = 'depreciation';

DELETE FROM cow_monthly_depreciation 
WHERE company_id = '71d432ba-89df-4000-ab2b-efad27664fa3';

-- Reset cow depreciation values to 0 so they get recalculated properly
UPDATE cows 
SET 
  total_depreciation = 0,
  current_value = purchase_price
WHERE company_id = '71d432ba-89df-4000-ab2b-efad27664fa3';