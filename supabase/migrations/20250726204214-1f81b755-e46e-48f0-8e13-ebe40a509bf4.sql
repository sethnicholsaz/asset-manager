-- Create a trigger function to automatically clean up invalid depreciation entries 
-- when a disposition is created (works for both UI and CSV uploads)
CREATE OR REPLACE FUNCTION public.cleanup_invalid_depreciation_on_disposition()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
BEGIN
  -- Clean up any depreciation entries that occur after the disposition date
  DELETE FROM public.journal_lines 
  WHERE journal_entry_id IN (
    SELECT je.id
    FROM public.journal_entries je
    JOIN public.journal_lines jl ON jl.journal_entry_id = je.id
    WHERE je.entry_type = 'depreciation'
      AND je.entry_date > NEW.disposition_date
      AND jl.cow_id = NEW.cow_id
  );
  
  -- Remove any empty journal entries
  DELETE FROM public.journal_entries 
  WHERE entry_type = 'depreciation'
    AND NOT EXISTS (
      SELECT 1 FROM public.journal_lines jl 
      WHERE jl.journal_entry_id = journal_entries.id
    );
    
  RETURN NEW;
END;
$$;

-- Create trigger that fires AFTER any disposition is inserted or updated
CREATE OR REPLACE TRIGGER cleanup_depreciation_after_disposition
  AFTER INSERT OR UPDATE ON public.cow_dispositions
  FOR EACH ROW
  EXECUTE FUNCTION public.cleanup_invalid_depreciation_on_disposition();

-- Also create a function to prevent future invalid depreciation entries
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
    IF EXISTS (
      SELECT 1 
      FROM public.journal_lines jl
      JOIN public.cow_dispositions cd ON cd.cow_id = jl.cow_id
      WHERE jl.journal_entry_id = NEW.id
        AND NEW.entry_date > cd.disposition_date
    ) THEN
      RAISE EXCEPTION 'Cannot create depreciation entries after cow disposition date';
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$;

-- Create trigger to prevent invalid depreciation entries from being created
CREATE OR REPLACE TRIGGER prevent_invalid_depreciation_entries
  BEFORE INSERT OR UPDATE ON public.journal_entries
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_depreciation_after_disposition();