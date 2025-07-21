-- Clean up duplicate journal entries for cow #1023
-- Keep only one bulk entry per cow for 2024

WITH duplicates AS (
  SELECT 
    je.id,
    ROW_NUMBER() OVER (
      PARTITION BY je.description, je.entry_date, je.company_id 
      ORDER BY je.created_at
    ) as rn
  FROM journal_entries je
  WHERE je.description LIKE 'Historical Depreciation through 2024%'
    AND je.company_id = '71d432ba-89df-4000-ab2b-efad27664fa3'
),
entries_to_delete AS (
  SELECT id FROM duplicates WHERE rn > 1
)

-- Delete duplicate journal lines first
DELETE FROM journal_lines 
WHERE journal_entry_id IN (SELECT id FROM entries_to_delete);

-- Delete duplicate journal entries  
DELETE FROM journal_entries 
WHERE id IN (SELECT id FROM entries_to_delete);

-- Update cow_monthly_depreciation records to point to the remaining journal entry
UPDATE cow_monthly_depreciation cmd
SET journal_entry_id = (
  SELECT je.id 
  FROM journal_entries je 
  WHERE je.description LIKE 'Historical Depreciation through 2024 - Cow #1023%'
    AND je.company_id = '71d432ba-89df-4000-ab2b-efad27664fa3'
  LIMIT 1
)
WHERE cmd.cow_id = 'cow_1753069018721_6' 
  AND cmd.year = 2024;