-- Update current value to 0 for all disposed cows
-- Disposed cows should have no current value

-- First, update all cows that have dispositions to have current_value = 0
UPDATE cows 
SET current_value = 0,
    updated_at = now()
WHERE id IN (
  SELECT DISTINCT cow_id 
  FROM cow_dispositions
);

-- Also update the cow status for disposed cows to reflect their actual status
UPDATE cows 
SET status = CASE 
  WHEN cd.disposition_type = 'sale' THEN 'sold'
  WHEN cd.disposition_type = 'death' THEN 'deceased'  
  WHEN cd.disposition_type = 'culled' THEN 'sold'
  ELSE 'inactive'
END,
updated_at = now()
FROM cow_dispositions cd
WHERE cows.id = cd.cow_id
  AND cows.status = 'active';  -- Only update if still marked as active

-- Create a trigger to automatically set current_value to 0 when a cow is disposed
CREATE OR REPLACE FUNCTION update_cow_on_disposition()
RETURNS TRIGGER AS $$
BEGIN
  -- Update the cow's current value to 0 and status when disposed
  UPDATE cows 
  SET current_value = 0,
      status = CASE 
        WHEN NEW.disposition_type = 'sale' THEN 'sold'
        WHEN NEW.disposition_type = 'death' THEN 'deceased'
        WHEN NEW.disposition_type = 'culled' THEN 'sold'
        ELSE 'inactive'
      END,
      updated_at = now()
  WHERE id = NEW.cow_id;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger on cow_dispositions insert
DROP TRIGGER IF EXISTS trigger_update_cow_on_disposition ON cow_dispositions;
CREATE TRIGGER trigger_update_cow_on_disposition
  AFTER INSERT ON cow_dispositions
  FOR EACH ROW
  EXECUTE FUNCTION update_cow_on_disposition();