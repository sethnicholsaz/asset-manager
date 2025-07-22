-- Update cows to have 0 current value when disposed and fix salvage value defaults

-- Update current value to 0 for disposed cows
UPDATE cows 
SET current_value = 0
WHERE status IN ('sold', 'deceased') 
  AND current_value > 0;

-- Set default salvage percentage to 10% for the main company (since it shows 0% in settings but cows have 10%)
UPDATE depreciation_settings 
SET default_salvage_percentage = 10
WHERE company_id = '2da00486-874e-41ef-b8d4-07f3ae20868a';