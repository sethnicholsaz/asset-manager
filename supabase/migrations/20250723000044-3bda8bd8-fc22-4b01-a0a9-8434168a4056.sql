-- Create a function to process missing disposition journals in batches
CREATE OR REPLACE FUNCTION public.process_missing_disposition_journals(p_company_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  disposition_record RECORD;
  disposition_result JSONB;
  total_processed INTEGER := 0;
  total_amount NUMERIC := 0;
  error_count INTEGER := 0;
  results JSONB[] := ARRAY[]::JSONB[];
BEGIN
  -- Process all dispositions that don't have journal entries
  FOR disposition_record IN 
    SELECT cd.id, cd.cow_id, cd.disposition_type, cd.disposition_date, cd.sale_amount,
           c.tag_number, c.purchase_price
    FROM cow_dispositions cd
    JOIN cows c ON c.id = cd.cow_id
    WHERE cd.company_id = p_company_id
      AND cd.journal_entry_id IS NULL
  LOOP
    -- Process disposition journal for this disposition
    SELECT process_disposition_journal(disposition_record.id) INTO disposition_result;
    
    IF (disposition_result->>'success')::BOOLEAN THEN
      total_processed := total_processed + 1;
      total_amount := total_amount + COALESCE(disposition_record.sale_amount, 0);
      results := results || jsonb_build_object(
        'disposition_id', disposition_record.id,
        'cow_id', disposition_record.cow_id,
        'tag_number', disposition_record.tag_number,
        'disposition_type', disposition_record.disposition_type,
        'sale_amount', COALESCE(disposition_record.sale_amount, 0),
        'status', 'success'
      );
    ELSE
      error_count := error_count + 1;
      results := results || jsonb_build_object(
        'disposition_id', disposition_record.id,
        'cow_id', disposition_record.cow_id,
        'tag_number', disposition_record.tag_number,
        'disposition_type', disposition_record.disposition_type,
        'status', 'error',
        'error', disposition_result->>'error'
      );
    END IF;
    
    -- Exit early if processing too many to prevent timeout
    IF (total_processed + error_count) >= 1000 THEN
      results := results || jsonb_build_object(
        'disposition_id', 'system',
        'tag_number', 'BATCH_LIMIT',
        'status', 'info',
        'error', 'Processed 1000 dispositions, stopping to prevent timeout. Run again to continue.'
      );
      EXIT;
    END IF;
  END LOOP;
  
  RETURN jsonb_build_object(
    'success', true,
    'total_processed', total_processed,
    'total_amount', total_amount,
    'error_count', error_count,
    'results', results
  );
  
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object(
    'success', false,
    'error', SQLERRM,
    'total_processed', total_processed,
    'error_count', error_count
  );
END;
$$;