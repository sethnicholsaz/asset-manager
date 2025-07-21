-- Update the upsert_depreciation_settings function to include journal_processing_day parameter
CREATE OR REPLACE FUNCTION public.upsert_depreciation_settings(
  p_company_id uuid, 
  p_default_depreciation_method text, 
  p_default_depreciation_years integer, 
  p_default_salvage_percentage numeric, 
  p_auto_calculate_depreciation boolean, 
  p_monthly_calculation_day integer, 
  p_include_partial_months boolean, 
  p_round_to_nearest_dollar boolean, 
  p_fiscal_year_start_month integer,
  p_journal_processing_day integer DEFAULT 5
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
  result_id UUID;
BEGIN
  INSERT INTO public.depreciation_settings (
    company_id, default_depreciation_method, default_depreciation_years,
    default_salvage_percentage, auto_calculate_depreciation, monthly_calculation_day,
    include_partial_months, round_to_nearest_dollar, fiscal_year_start_month,
    journal_processing_day, updated_at
  )
  VALUES (
    p_company_id, p_default_depreciation_method, p_default_depreciation_years,
    p_default_salvage_percentage, p_auto_calculate_depreciation, p_monthly_calculation_day,
    p_include_partial_months, p_round_to_nearest_dollar, p_fiscal_year_start_month,
    p_journal_processing_day, now()
  )
  ON CONFLICT (company_id)
  DO UPDATE SET
    default_depreciation_method = EXCLUDED.default_depreciation_method,
    default_depreciation_years = EXCLUDED.default_depreciation_years,
    default_salvage_percentage = EXCLUDED.default_salvage_percentage,
    auto_calculate_depreciation = EXCLUDED.auto_calculate_depreciation,
    monthly_calculation_day = EXCLUDED.monthly_calculation_day,
    include_partial_months = EXCLUDED.include_partial_months,
    round_to_nearest_dollar = EXCLUDED.round_to_nearest_dollar,
    fiscal_year_start_month = EXCLUDED.fiscal_year_start_month,
    journal_processing_day = EXCLUDED.journal_processing_day,
    updated_at = now()
  RETURNING id INTO result_id;
  
  RETURN result_id;
END;
$function$;