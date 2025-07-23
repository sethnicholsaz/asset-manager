-- Fix disposition journal creation issue
-- Step 1: Update cow_dispositions to use actual cow IDs instead of tag numbers
UPDATE cow_dispositions 
SET cow_id = c.id
FROM cows c 
WHERE cow_dispositions.cow_id = c.tag_number 
  AND cow_dispositions.company_id = c.company_id;

-- Step 2: Update cows to link back to their dispositions  
UPDATE cows 
SET disposition_id = cd.id
FROM cow_dispositions cd
WHERE cd.cow_id = cows.id 
  AND cd.company_id = cows.company_id;