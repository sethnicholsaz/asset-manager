-- Function to clean up depreciation entries that occur after a cow's disposition date
CREATE OR REPLACE FUNCTION public.cleanup_post_disposition_depreciation(p_cow_id text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  cow_record RECORD;
  entries_removed INTEGER := 0;
BEGIN
  -- Get cow and disposition details
  SELECT c.id, c.tag_number, cd.disposition_date
  INTO cow_record
  FROM cows c
  JOIN cow_dispositions cd ON cd.cow_id = c.id
  WHERE c.id = p_cow_id;
  
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Cow or disposition not found');
  END IF;
  
  -- Remove depreciation entries that occur after disposition date
  WITH deleted_entries AS (
    DELETE FROM journal_lines 
    WHERE journal_entry_id IN (
      SELECT je.id FROM journal_entries je
      WHERE je.entry_type = 'depreciation'
      AND je.entry_date > cow_record.disposition_date
    ) 
    AND cow_id = p_cow_id
    RETURNING journal_entry_id
  )
  SELECT COUNT(*) / 2 INTO entries_removed FROM deleted_entries; -- Divide by 2 because each entry has debit and credit lines
  
  -- Update cow depreciation values to reflect actual accumulated depreciation
  PERFORM update_cow_depreciation_values(p_cow_id);
  
  RETURN jsonb_build_object(
    'success', true,
    'cow_id', p_cow_id,
    'entries_removed', entries_removed,
    'disposition_date', cow_record.disposition_date
  );
END;
$function$;