-- Fix the prevent_depreciation_after_disposition trigger to allow historical depreciation entries
-- The current trigger is too restrictive and prevents creating historical depreciation entries up to the disposition date

CREATE OR REPLACE FUNCTION public.prevent_depreciation_after_disposition()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER  
SET search_path TO ''
AS $$
BEGIN
  -- Check if this is a depreciation entry for a cow that's already disposed
  IF NEW.entry_type = 'depreciation' THEN
    -- Check if any journal lines in this entry are for disposed cows
    -- AND the entry date is AFTER the disposition date (not on or before)
    IF EXISTS (
      SELECT 1 
      FROM public.journal_lines jl
      JOIN public.cow_dispositions cd ON cd.cow_id = jl.cow_id
      WHERE jl.journal_entry_id = NEW.id
        AND NEW.entry_date > cd.disposition_date  -- Only prevent entries AFTER disposition date
    ) THEN
      RAISE EXCEPTION 'Cannot create depreciation entries after cow disposition date';
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$;

-- Update the trigger to use the fixed function
CREATE OR REPLACE TRIGGER prevent_invalid_depreciation_entries
  BEFORE INSERT OR UPDATE ON public.journal_entries
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_depreciation_after_disposition(); 