-- Fix journal_entries entry_type constraint to allow reversal types
ALTER TABLE journal_entries DROP CONSTRAINT IF EXISTS journal_entries_entry_type_check;

-- Add updated constraint that includes reversal types
ALTER TABLE journal_entries ADD CONSTRAINT journal_entries_entry_type_check 
CHECK (entry_type IN ('acquisition', 'depreciation', 'disposition', 'balance_adjustment', 'acquisition_reversal', 'depreciation_reversal', 'disposition_reversal'));