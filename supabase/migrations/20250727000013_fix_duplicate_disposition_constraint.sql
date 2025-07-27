-- Fix the unique constraint on cow_dispositions to prevent duplicate disposition records
-- A cow should only have ONE disposition record, regardless of type or date
-- This prevents the issue where a cow can be both "sold" and "die" causing duplicate journal entries

-- First, identify and clean up existing duplicate dispositions
-- Keep only the most recent disposition for each cow
DELETE FROM cow_dispositions a USING (
  SELECT MAX(created_at) as max_created_at, cow_id
  FROM cow_dispositions 
  GROUP BY cow_id
  HAVING COUNT(*) > 1
) b
WHERE a.cow_id = b.cow_id 
  AND a.created_at < b.max_created_at;

-- Drop the existing constraint that allows multiple dispositions per cow
ALTER TABLE cow_dispositions 
DROP CONSTRAINT IF EXISTS unique_cow_disposition;

-- Add a new constraint that only allows ONE disposition per cow
ALTER TABLE cow_dispositions 
ADD CONSTRAINT unique_cow_disposition 
UNIQUE (cow_id);

-- Add a comment to explain the constraint
COMMENT ON CONSTRAINT unique_cow_disposition ON cow_dispositions IS 
'Prevents duplicate disposition records for the same cow. Each cow can only have one disposition record.'; 