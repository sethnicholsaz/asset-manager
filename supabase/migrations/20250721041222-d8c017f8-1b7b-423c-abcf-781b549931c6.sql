-- Update the fetch_depreciation_settings function to include journal_processing_day
CREATE OR REPLACE FUNCTION public.fetch_depreciation_settings(p_company_id uuid)
 RETURNS TABLE(id uuid, company_id uuid, default_depreciation_method text, default_depreciation_years integer, default_salvage_percentage numeric, auto_calculate_depreciation boolean, monthly_calculation_day integer, journal_processing_day integer, include_partial_months boolean, round_to_nearest_dollar boolean, fiscal_year_start_month integer, created_at timestamp with time zone, updated_at timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
  RETURN QUERY
  SELECT ds.id, ds.company_id, ds.default_depreciation_method, ds.default_depreciation_years,
         ds.default_salvage_percentage, ds.auto_calculate_depreciation, ds.monthly_calculation_day,
         ds.journal_processing_day, ds.include_partial_months, ds.round_to_nearest_dollar, 
         ds.fiscal_year_start_month, ds.created_at, ds.updated_at
  FROM public.depreciation_settings ds
  WHERE ds.company_id = p_company_id;
END;
$function$;