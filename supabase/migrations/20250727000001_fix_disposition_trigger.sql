-- Fix the disposition trigger to use the enhanced function
-- This ensures disposition journals are created when dispositions are uploaded

-- Update the trigger function to use the enhanced disposition journal function
CREATE OR REPLACE FUNCTION public.create_disposition_journal_trigger()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
BEGIN
  -- Only create journal if one doesn't already exist
  IF NEW.journal_entry_id IS NULL THEN
    PERFORM public.process_disposition_journal_enhanced(NEW.id);
  END IF;
  
  RETURN NEW;
END;
$function$;

-- Ensure the trigger exists and is properly attached
DROP TRIGGER IF EXISTS auto_create_disposition_journal ON cow_dispositions;
CREATE TRIGGER auto_create_disposition_journal
  AFTER INSERT ON cow_dispositions
  FOR EACH ROW
  EXECUTE FUNCTION create_disposition_journal_trigger();

-- Add a function to manually process missing disposition journals
CREATE OR REPLACE FUNCTION public.process_missing_disposition_journals(p_company_id uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
  disposition_record RECORD;
  total_processed INTEGER := 0;
  total_errors INTEGER := 0;
  error_messages TEXT[] := ARRAY[]::TEXT[];
BEGIN
  -- Process dispositions that don't have journal entries
  FOR disposition_record IN 
    SELECT cd.* 
    FROM cow_dispositions cd
    WHERE cd.journal_entry_id IS NULL
      AND (p_company_id IS NULL OR cd.company_id = p_company_id)
  LOOP
    BEGIN
      PERFORM public.process_disposition_journal_enhanced(disposition_record.id);
      total_processed := total_processed + 1;
    EXCEPTION WHEN OTHERS THEN
      total_errors := total_errors + 1;
      error_messages := array_append(error_messages, 
        'Disposition ' || disposition_record.id || ': ' || SQLERRM);
    END;
  END LOOP;
  
  RETURN jsonb_build_object(
    'success', total_errors = 0,
    'total_processed', total_processed,
    'total_errors', total_errors,
    'error_messages', error_messages
  );
END;
$function$;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION public.process_missing_disposition_journals TO anon, authenticated; 