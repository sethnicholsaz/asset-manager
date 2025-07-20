-- Add trigger to update cow total_depreciation when journal entries are posted
-- This ensures accumulated depreciation is written back to cow records

CREATE OR REPLACE FUNCTION update_cow_depreciation()
RETURNS TRIGGER AS $$
DECLARE
  cow_record RECORD;
  monthly_depreciation NUMERIC;
  months_elapsed INTEGER;
  new_total_depreciation NUMERIC;
BEGIN
  -- Only process depreciation journal entries that are posted
  IF NEW.entry_type = 'depreciation' AND NEW.status = 'posted' THEN
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
                       (NEW.month - EXTRACT(MONTH FROM cow_record.freshen_date));
      
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
    END LOOP;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create the trigger
CREATE TRIGGER update_cow_depreciation_trigger
  AFTER INSERT OR UPDATE ON stored_journal_entries
  FOR EACH ROW
  EXECUTE FUNCTION update_cow_depreciation();