-- Clean up invalid June 30 depreciation entry for cow #41174 (died June 5)
-- First delete the invalid journal lines
DELETE FROM public.journal_lines 
WHERE journal_entry_id IN (
  SELECT je.id 
  FROM public.journal_entries je
  WHERE je.entry_type = 'depreciation' 
    AND je.entry_date = '2025-06-30'
    AND je.company_id = '2da00486-874e-41ef-b8d4-07f3ae20868a'
)
AND cow_id = 'cow_1753551709332_1';

-- Delete the invalid journal entry
DELETE FROM public.journal_entries 
WHERE entry_type = 'depreciation' 
  AND entry_date = '2025-06-30'
  AND company_id = '2da00486-874e-41ef-b8d4-07f3ae20868a';

-- Update cow totals to reflect only valid depreciation (April + May = 63.25)
UPDATE public.cows 
SET 
  total_depreciation = 63.25,  -- Only April and May depreciation
  current_value = 2108.24 - 63.25,  -- Purchase price minus valid depreciation
  updated_at = now()
WHERE id = 'cow_1753551709332_1';

-- Now process the disposition using the new partial depreciation function
SELECT public.process_disposition_with_partial_depreciation('951adc4c-3105-4bbb-ad40-9d703ddf5a8a');