-- Optimize the missing acquisitions processor to handle large datasets more efficiently
CREATE OR REPLACE FUNCTION public.process_missing_acquisition_journals(p_company_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  cow_record RECORD;
  acquisition_result JSONB;
  total_processed INTEGER := 0;
  total_amount NUMERIC := 0;
  error_count INTEGER := 0;
  results JSONB[] := ARRAY[]::JSONB[];
BEGIN
  -- Process all cows that don't have acquisition journal entries (both purchased and raised)
  -- Removed the sleep delay to prevent timeouts on large datasets
  FOR cow_record IN 
    SELECT c.id, c.tag_number, c.purchase_price, c.acquisition_type, c.freshen_date
    FROM cows c
    WHERE c.company_id = p_company_id
      AND NOT EXISTS (
        SELECT 1 FROM journal_entries je
        JOIN journal_lines jl ON jl.journal_entry_id = je.id
        WHERE je.company_id = p_company_id
          AND je.entry_type = 'acquisition'
          AND jl.cow_id = c.id
      )
  LOOP
    -- Process acquisition journal for this cow
    SELECT process_acquisition_journal(cow_record.id, p_company_id) INTO acquisition_result;
    
    IF (acquisition_result->>'success')::BOOLEAN THEN
      total_processed := total_processed + 1;
      total_amount := total_amount + cow_record.purchase_price;
      results := results || jsonb_build_object(
        'cow_id', cow_record.id,
        'tag_number', cow_record.tag_number,
        'amount', cow_record.purchase_price,
        'acquisition_type', cow_record.acquisition_type,
        'status', 'success'
      );
    ELSE
      error_count := error_count + 1;
      results := results || jsonb_build_object(
        'cow_id', cow_record.id,
        'tag_number', cow_record.tag_number,
        'acquisition_type', cow_record.acquisition_type,
        'status', 'error',
        'error', acquisition_result->>'error'
      );
    END IF;
    
    -- Exit early if processing too many to prevent timeout
    IF (total_processed + error_count) >= 1000 THEN
      results := results || jsonb_build_object(
        'cow_id', 'system',
        'tag_number', 'BATCH_LIMIT',
        'status', 'info',
        'error', 'Processed 1000 cows, stopping to prevent timeout. Run again to continue.'
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