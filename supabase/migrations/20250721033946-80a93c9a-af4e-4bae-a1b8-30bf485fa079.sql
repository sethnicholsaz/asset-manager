-- Clean up duplicate journal entries for historical depreciation
-- Delete duplicate journal lines first
DELETE FROM journal_lines 
WHERE journal_entry_id IN (
  SELECT id FROM (
    SELECT 
      je.id,
      ROW_NUMBER() OVER (
        PARTITION BY je.description, je.entry_date, je.company_id 
        ORDER BY je.created_at
      ) as rn
    FROM journal_entries je
    WHERE je.description LIKE 'Historical Depreciation through 2024%'
      AND je.company_id = '71d432ba-89df-4000-ab2b-efad27664fa3'
  ) duplicates 
  WHERE rn > 1
);

-- Delete duplicate journal entries
DELETE FROM journal_entries 
WHERE id IN (
  SELECT id FROM (
    SELECT 
      je.id,
      ROW_NUMBER() OVER (
        PARTITION BY je.description, je.entry_date, je.company_id 
        ORDER BY je.created_at
      ) as rn
    FROM journal_entries je
    WHERE je.description LIKE 'Historical Depreciation through 2024%'
      AND je.company_id = '71d432ba-89df-4000-ab2b-efad27664fa3'
  ) duplicates 
  WHERE rn > 1
);