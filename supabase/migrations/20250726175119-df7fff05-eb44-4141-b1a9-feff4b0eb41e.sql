-- Clean up the invalid May 31 depreciation entry for cow #41405 (died May 7)
-- First, find and delete the invalid journal lines
DELETE FROM public.journal_lines 
WHERE journal_entry_id IN (
  SELECT je.id 
  FROM public.journal_entries je
  WHERE je.entry_type = 'depreciation' 
    AND je.entry_date = '2025-05-31'
    AND je.company_id IN (
      SELECT company_id FROM public.cows WHERE id = 'cow_1753547874327_8'
    )
)
AND cow_id = 'cow_1753547874327_8';

-- Delete the invalid journal entry
DELETE FROM public.journal_entries 
WHERE entry_type = 'depreciation' 
  AND entry_date = '2025-05-31'
  AND company_id IN (
    SELECT company_id FROM public.cows WHERE id = 'cow_1753547874327_8'
  )
  AND id IN (
    SELECT journal_entry_id FROM public.journal_lines 
    WHERE cow_id = 'cow_1753547874327_8'
  );

-- Update cow's totals to reflect correct depreciation (only April, not May)
UPDATE public.cows 
SET 
  total_depreciation = 29.48,  -- Only April depreciation
  current_value = 1965.16 - 29.48,  -- Purchase price minus valid depreciation
  updated_at = now()
WHERE id = 'cow_1753547874327_8';