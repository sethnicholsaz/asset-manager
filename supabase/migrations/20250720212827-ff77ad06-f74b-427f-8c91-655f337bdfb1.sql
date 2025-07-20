-- First, delete duplicate cow_dispositions keeping only the most recent ones
DELETE FROM cow_dispositions a USING (
  SELECT MIN(ctid) as ctid, cow_id, company_id, disposition_date, disposition_type
  FROM cow_dispositions 
  GROUP BY cow_id, company_id, disposition_date, disposition_type
  HAVING COUNT(*) > 1
) b
WHERE a.cow_id = b.cow_id 
  AND a.company_id = b.company_id 
  AND a.disposition_date = b.disposition_date 
  AND a.disposition_type = b.disposition_type 
  AND a.ctid <> b.ctid;

-- Add unique constraint to prevent future duplicates
ALTER TABLE cow_dispositions 
ADD CONSTRAINT unique_cow_disposition 
UNIQUE (cow_id, company_id, disposition_date, disposition_type);