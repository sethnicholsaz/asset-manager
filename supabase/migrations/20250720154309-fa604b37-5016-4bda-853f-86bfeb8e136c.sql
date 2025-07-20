-- Create a composite unique constraint on tag_number and company_id
-- This ensures tag numbers are only unique within each company
ALTER TABLE public.cows DROP CONSTRAINT IF EXISTS cows_tag_number_key;
ALTER TABLE public.cows ADD CONSTRAINT cows_tag_number_company_unique UNIQUE (tag_number, company_id);