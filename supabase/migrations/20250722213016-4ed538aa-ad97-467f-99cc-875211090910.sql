-- Set salvage value to $0 for all cows and update default settings

-- Update all existing cows to have $0 salvage value
UPDATE cows 
SET salvage_value = 0
WHERE company_id = '2da00486-874e-41ef-b8d4-07f3ae20868a';

-- Update the default salvage percentage to 0% in depreciation settings
UPDATE depreciation_settings 
SET default_salvage_percentage = 0
WHERE company_id = '2da00486-874e-41ef-b8d4-07f3ae20868a';