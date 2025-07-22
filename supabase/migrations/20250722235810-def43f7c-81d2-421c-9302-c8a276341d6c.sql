-- Remove the unique constraint that prevents multiple acquisition journal entries per month
-- This constraint was designed for depreciation entries but acquisition entries should be individual per cow

-- First, let's drop the existing unique constraint
ALTER TABLE journal_entries DROP CONSTRAINT IF EXISTS journal_entries_company_id_month_year_entry_type_key;

-- Create a new partial unique constraint that only applies to non-acquisition entry types
-- This allows multiple acquisition entries per month while maintaining uniqueness for other entry types
CREATE UNIQUE INDEX journal_entries_company_month_year_entry_type_unique 
ON journal_entries (company_id, month, year, entry_type) 
WHERE entry_type != 'acquisition';