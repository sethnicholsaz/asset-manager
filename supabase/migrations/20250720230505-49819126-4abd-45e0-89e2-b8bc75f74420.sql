-- Fix the depreciation update trigger
-- The issue is that the trigger isn't properly updating cow records
-- Let's drop and recreate the trigger with better logging

DROP TRIGGER IF EXISTS update_cow_depreciation_trigger ON stored_journal_entries;

-- Create improved trigger function with logging
CREATE OR REPLACE FUNCTION update_cow_depreciation()
RETURNS TRIGGER AS $$
DECLARE
  cow_record RECORD;
  monthly_depreciation NUMERIC;
  months_elapsed INTEGER;
  new_total_depreciation NUMERIC;
  updated_count INTEGER := 0;
BEGIN
  RAISE LOG 'Trigger fired for entry_type: %, status: %', NEW.entry_type, NEW.status;
  
  -- Only process depreciation journal entries that are posted
  IF NEW.entry_type = 'depreciation' AND NEW.status = 'posted' THEN
    RAISE LOG 'Processing depreciation for company: %, month: %, year: %', NEW.company_id, NEW.month, NEW.year;
    
    -- Update all active cows for this company
    FOR cow_record IN 
      SELECT id, tag_number, purchase_price, salvage_value, freshen_date, total_depreciation
      FROM cows 
      WHERE company_id = NEW.company_id AND status = 'active'
    LOOP
      -- Calculate monthly depreciation for this cow
      monthly_depreciation := (cow_record.purchase_price - cow_record.salvage_value) / (5 * 12);
      
      -- Calculate months elapsed from freshen date to end of journal entry month
      months_elapsed := (NEW.year - EXTRACT(YEAR FROM cow_record.freshen_date)) * 12 + 
                       (NEW.month - EXTRACT(MONTH FROM cow_record.freshen_date)) + 1;
      
      -- Ensure months_elapsed is not negative
      months_elapsed := GREATEST(0, months_elapsed);
      
      -- Calculate new total depreciation
      new_total_depreciation := monthly_depreciation * months_elapsed;
      
      -- Ensure depreciation doesn't exceed depreciable amount
      new_total_depreciation := LEAST(new_total_depreciation, cow_record.purchase_price - cow_record.salvage_value);
      
      -- Update the cow's total depreciation and current value
      UPDATE cows 
      SET 
        total_depreciation = new_total_depreciation,
        current_value = GREATEST(cow_record.salvage_value, cow_record.purchase_price - new_total_depreciation),
        updated_at = now()
      WHERE id = cow_record.id;
      
      updated_count := updated_count + 1;
    END LOOP;
    
    RAISE LOG 'Updated % cow records with depreciation', updated_count;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Recreate the trigger
CREATE TRIGGER update_cow_depreciation_trigger
  AFTER INSERT OR UPDATE ON stored_journal_entries
  FOR EACH ROW
  EXECUTE FUNCTION update_cow_depreciation();

-- Manually trigger the update for existing posted depreciation entries
DO $$
DECLARE
  entry_record RECORD;
BEGIN
  FOR entry_record IN 
    SELECT * FROM stored_journal_entries 
    WHERE entry_type = 'depreciation' AND status = 'posted'
  LOOP
    PERFORM update_cow_depreciation();
  END LOOP;
END $$;