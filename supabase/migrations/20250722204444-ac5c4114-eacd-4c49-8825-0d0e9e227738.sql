-- Create a more efficient batch processing function that processes one year at a time
CREATE OR REPLACE FUNCTION process_historical_depreciation_by_year(
  p_company_id UUID,
  p_target_year INTEGER
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  current_month INTEGER;
  monthly_result JSONB;
  total_processed INTEGER := 0;
  total_amount NUMERIC := 0;
  year_start_date DATE;
  year_end_date DATE;
BEGIN
  -- Set year boundaries
  year_start_date := (p_target_year || '-01-01')::DATE;
  year_end_date := (p_target_year || '-12-31')::DATE;
  
  -- Don't process future years
  IF year_start_date > CURRENT_DATE THEN
    RETURN jsonb_build_object(
      'success', true,
      'message', 'Skipping future year',
      'year', p_target_year,
      'months_processed', 0,
      'total_amount', 0
    );
  END IF;
  
  -- Process each month in the year
  FOR current_month IN 1..12 LOOP
    DECLARE
      month_date DATE := (p_target_year || '-' || LPAD(current_month::TEXT, 2, '0') || '-01')::DATE;
    BEGIN
      -- Don't process future months
      IF month_date <= CURRENT_DATE THEN
        -- Process this month
        SELECT process_monthly_depreciation(p_company_id, current_month, p_target_year) INTO monthly_result;
        
        -- Accumulate results
        IF (monthly_result->>'success')::BOOLEAN THEN
          total_processed := total_processed + COALESCE((monthly_result->>'cows_processed')::INTEGER, 0);
          total_amount := total_amount + COALESCE((monthly_result->>'total_amount')::NUMERIC, 0);
        END IF;
        
        -- Small delay between months
        PERFORM pg_sleep(0.05);
      END IF;
    END;
  END LOOP;
  
  RETURN jsonb_build_object(
    'success', true,
    'year', p_target_year,
    'months_processed', 12,
    'cows_processed', total_processed,
    'total_amount', total_amount
  );
  
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object(
    'success', false,
    'error', SQLERRM,
    'year', p_target_year
  );
END;
$$;

-- Create a function to get the processing status for a company
CREATE OR REPLACE FUNCTION get_historical_processing_status(p_company_id UUID)
RETURNS TABLE(
  earliest_cow_year INTEGER,
  journal_entries_exist BOOLEAN,
  years_with_entries INTEGER[],
  processing_needed BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  earliest_year INTEGER;
  current_year INTEGER := EXTRACT(YEAR FROM CURRENT_DATE)::INTEGER;
  existing_years INTEGER[];
BEGIN
  -- Get earliest freshen date year
  SELECT EXTRACT(YEAR FROM MIN(freshen_date))::INTEGER 
  INTO earliest_year
  FROM cows 
  WHERE company_id = p_company_id;
  
  -- Get years that already have journal entries
  SELECT ARRAY_AGG(DISTINCT year ORDER BY year)
  INTO existing_years
  FROM journal_entries
  WHERE company_id = p_company_id AND entry_type = 'depreciation';
  
  RETURN QUERY SELECT 
    earliest_year as earliest_cow_year,
    (existing_years IS NOT NULL AND array_length(existing_years, 1) > 0) as journal_entries_exist,
    COALESCE(existing_years, ARRAY[]::INTEGER[]) as years_with_entries,
    (earliest_year IS NOT NULL AND 
     (existing_years IS NULL OR 
      array_length(existing_years, 1) < (current_year - earliest_year + 1))) as processing_needed;
END;
$$;