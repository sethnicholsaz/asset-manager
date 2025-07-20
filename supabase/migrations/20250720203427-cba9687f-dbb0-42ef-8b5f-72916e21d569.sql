-- Fix cow disposition writeback issues
-- Update disposition records to use proper cow IDs instead of tag numbers
-- and ensure cows are properly linked to their dispositions

-- First, update cow_dispositions to use proper cow IDs
UPDATE public.cow_dispositions 
SET cow_id = c.id
FROM public.cows c 
WHERE cow_dispositions.cow_id = c.tag_number
AND cow_dispositions.company_id = c.company_id;

-- Update cows to link them to their dispositions and ensure proper status
UPDATE public.cows 
SET disposition_id = cd.id,
    status = CASE 
        WHEN cd.disposition_type = 'death' THEN 'deceased'
        WHEN cd.disposition_type = 'sale' THEN 'sold'
        WHEN cd.disposition_type = 'culled' THEN 'sold'
        ELSE status
    END
FROM public.cow_dispositions cd 
WHERE cows.id = cd.cow_id
AND cows.disposition_id IS NULL;