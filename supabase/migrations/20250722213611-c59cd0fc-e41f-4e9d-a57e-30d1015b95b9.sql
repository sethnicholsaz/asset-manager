-- Fix disposition and depreciation calculation issues

-- First, let's create the missing disposition record for cow 38333 that died in March
INSERT INTO cow_dispositions (
  cow_id, company_id, disposition_date, disposition_type, 
  sale_amount, final_book_value, gain_loss, notes
)
SELECT 
  c.id, c.company_id, '2025-03-15'::date, 'death',
  0, c.current_value, -c.current_value, 'Death - created from missing disposition data'
FROM cows c 
WHERE c.tag_number = '38333' 
  AND c.company_id = '2da00486-874e-41ef-b8d4-07f3ae20868a'
  AND c.status = 'deceased'
  AND NOT EXISTS (
    SELECT 1 FROM cow_dispositions cd WHERE cd.cow_id = c.id
  );

-- Update the monthly depreciation function to stop at last completed month, not current month
CREATE OR REPLACE FUNCTION public.process_historical_depreciation_by_year(p_company_id uuid, p_target_year integer)
RETURNS jsonb
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
  last_complete_month INTEGER;
  last_complete_year INTEGER;
BEGIN
  -- Calculate the last completed month (previous month)
  IF EXTRACT(MONTH FROM CURRENT_DATE) = 1 THEN
    last_complete_month := 12;
    last_complete_year := EXTRACT(YEAR FROM CURRENT_DATE)::INTEGER - 1;
  ELSE
    last_complete_month := EXTRACT(MONTH FROM CURRENT_DATE)::INTEGER - 1;
    last_complete_year := EXTRACT(YEAR FROM CURRENT_DATE)::INTEGER;
  END IF;
  
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
      
      -- Process this month
      SELECT process_monthly_depreciation(p_company_id, current_month, p_target_year) INTO monthly_result;
      
      -- Accumulate results
      IF (monthly_result->>'success')::BOOLEAN THEN
        total_processed := total_processed + COALESCE((monthly_result->>'cows_processed')::INTEGER, 0);
        total_amount := total_amount + COALESCE((monthly_result->>'total_amount')::NUMERIC, 0);
      END IF;
      
      -- Small delay between months
      PERFORM pg_sleep(0.05);
    END;
  END LOOP;
  
  RETURN jsonb_build_object(
    'success', true,
    'year', p_target_year,
    'months_processed', current_month - 1,
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