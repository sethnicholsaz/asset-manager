-- Update unique constraint to include company_id so each company can have their own defaults per birth year
ALTER TABLE public.purchase_price_defaults DROP CONSTRAINT IF EXISTS purchase_price_defaults_birth_year_key;
ALTER TABLE public.purchase_price_defaults ADD CONSTRAINT purchase_price_defaults_birth_year_company_unique UNIQUE (birth_year, company_id);