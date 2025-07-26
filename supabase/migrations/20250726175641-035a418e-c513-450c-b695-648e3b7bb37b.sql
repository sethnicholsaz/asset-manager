-- Clean up invalid June 30 depreciation entry for cow #41174 (died June 5)
-- Also reprocess the disposition with proper partial month depreciation

-- First, get the cow and disposition IDs
WITH cow_info AS (
  SELECT c.id as cow_id, c.company_id, cd.id as disposition_id, cd.disposition_date
  FROM public.cows c
  JOIN public.cow_dispositions cd ON cd.cow_id = c.id
  WHERE c.tag_number = '41174'
)
-- Delete the invalid June 30 depreciation entries
DELETE FROM public.journal_lines 
WHERE journal_entry_id IN (
  SELECT je.id 
  FROM public.journal_entries je
  JOIN cow_info ci ON je.company_id = ci.company_id
  WHERE je.entry_type = 'depreciation' 
    AND je.entry_date = '2025-06-30'
)
AND cow_id = (SELECT cow_id FROM cow_info);

-- Delete the invalid journal entry
DELETE FROM public.journal_entries 
WHERE entry_type = 'depreciation' 
  AND entry_date = '2025-06-30'
  AND company_id = (SELECT company_id FROM cow_info);

-- Now reprocess the disposition using the new function
DO $$
DECLARE
  disposition_uuid UUID;
  result JSONB;
BEGIN
  -- Get the disposition ID
  SELECT cd.id INTO disposition_uuid
  FROM public.cows c
  JOIN public.cow_dispositions cd ON cd.cow_id = c.id
  WHERE c.tag_number = '41174';
  
  -- Process with new partial depreciation function
  SELECT public.process_disposition_with_partial_depreciation(disposition_uuid) INTO result;
  
  RAISE NOTICE 'Disposition processing result: %', result;
END $$;