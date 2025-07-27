-- Fix the historical processing logic to properly determine which years need processing
-- The current logic only checks if journal entries exist, but doesn't check if cows have depreciation calculated

CREATE OR REPLACE FUNCTION public.get_historical_processing_status(p_company_id uuid)
 RETURNS TABLE(earliest_cow_year integer, journal_entries_exist boolean, years_with_entries integer[], processing_needed boolean)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = ''
AS $function$
DECLARE
  earliest_year INTEGER;
  current_year INTEGER := EXTRACT(YEAR FROM CURRENT_DATE)::INTEGER;
  existing_years INTEGER[];
  cows_without_depreciation INTEGER;
  total_cows_with_freshen_dates INTEGER;
  years_needing_processing INTEGER[];
BEGIN
  -- Get earliest freshen date year
  SELECT EXTRACT(YEAR FROM MIN(freshen_date))::INTEGER 
  INTO earliest_year
  FROM public.cows 
  WHERE company_id = p_company_id;
  
  -- Get years that already have journal entries
  SELECT ARRAY_AGG(DISTINCT year ORDER BY year)
  INTO existing_years
  FROM public.journal_entries
  WHERE company_id = p_company_id AND entry_type = 'depreciation';
  
  -- Count cows that need depreciation processing
  SELECT 
    COUNT(*) as total_cows,
    COUNT(CASE WHEN total_depreciation = 0 OR total_depreciation IS NULL THEN 1 END) as cows_needing_depreciation
  INTO total_cows_with_freshen_dates, cows_without_depreciation
  FROM public.cows
  WHERE company_id = p_company_id 
    AND freshen_date IS NOT NULL;
  
  -- Determine which years need processing based on cows that need depreciation
  -- If cows need depreciation, we need to process all years from earliest to current
  IF cows_without_depreciation > 0 THEN
    SELECT ARRAY_AGG(year ORDER BY year)
    INTO years_needing_processing
    FROM generate_series(earliest_year, current_year) AS year;
  ELSE
    years_needing_processing := ARRAY[]::INTEGER[];
  END IF;
  
  RETURN QUERY SELECT 
    earliest_year as earliest_cow_year,
    (existing_years IS NOT NULL AND array_length(existing_years, 1) > 0) as journal_entries_exist,
    COALESCE(years_needing_processing, ARRAY[]::INTEGER[]) as years_with_entries,
    (earliest_year IS NOT NULL AND 
     total_cows_with_freshen_dates > 0 AND
     cows_without_depreciation > 0) as processing_needed;
END;
$function$; 