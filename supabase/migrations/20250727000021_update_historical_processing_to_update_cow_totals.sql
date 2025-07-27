-- Update the historical depreciation processing to automatically update cow depreciation totals
-- This ensures that the cows table is updated with the correct total_depreciation values

CREATE OR REPLACE FUNCTION public.process_historical_depreciation_by_year_with_mode(
  p_company_id uuid, 
  p_target_year integer,
  p_processing_mode text DEFAULT 'historical'
)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  current_month INTEGER;
  monthly_result JSONB;
  total_processed INTEGER := 0;
  total_amount NUMERIC := 0;
  year_start_date DATE;
  year_end_date DATE;
  last_complete_month INTEGER;
  last_complete_year INTEGER;
  current_posting_month INTEGER;
  current_posting_year INTEGER;
  update_result JSONB;
BEGIN
  -- Calculate the last completed month (previous month)
  IF EXTRACT(MONTH FROM CURRENT_DATE) = 1 THEN
    last_complete_month := 12;
    last_complete_year := EXTRACT(YEAR FROM CURRENT_DATE)::INTEGER - 1;
  ELSE
    last_complete_month := EXTRACT(MONTH FROM CURRENT_DATE)::INTEGER - 1;
    last_complete_year := EXTRACT(YEAR FROM CURRENT_DATE)::INTEGER;
  END IF;
  
  -- For production mode, set current posting period
  current_posting_month := EXTRACT(MONTH FROM CURRENT_DATE)::INTEGER;
  current_posting_year := EXTRACT(YEAR FROM CURRENT_DATE)::INTEGER;
  
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
  
  -- Process each month in the year up to last completed month
  FOR current_month IN 1..12 LOOP
    DECLARE
      month_date DATE := (p_target_year || '-' || LPAD(current_month::TEXT, 2, '0') || '-01')::DATE;
    BEGIN
      -- Stop at last completed month
      IF (p_target_year > last_complete_year) OR 
         (p_target_year = last_complete_year AND current_month > last_complete_month) THEN
        EXIT; -- Stop processing future months
      END IF;
      
      -- Process this month with the specified mode
      SELECT public.process_monthly_depreciation_with_mode(
        p_company_id, 
        current_month, 
        p_target_year,
        p_processing_mode,
        current_posting_month,
        current_posting_year
      ) INTO monthly_result;
      
      -- Accumulate results
      IF (monthly_result->>'success')::BOOLEAN THEN
        total_processed := total_processed + COALESCE((monthly_result->>'cows_processed')::INTEGER, 0);
        total_amount := total_amount + COALESCE((monthly_result->>'total_amount')::NUMERIC, 0);
      END IF;
      
      -- Small delay between months
      PERFORM pg_sleep(0.05);
    END;
  END LOOP;
  
  -- Update cow depreciation totals after processing the year
  SELECT public.update_cow_depreciation_totals(p_company_id) INTO update_result;
  
  RETURN jsonb_build_object(
    'success', true,
    'processing_mode', p_processing_mode,
    'year', p_target_year,
    'months_processed', current_month - 1,
    'cows_processed', total_processed,
    'total_amount', total_amount,
    'cow_totals_updated', (update_result->>'success')::BOOLEAN
  );
  
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object(
    'success', false,
    'error', SQLERRM,
    'year', p_target_year
  );
END;
$function$; 