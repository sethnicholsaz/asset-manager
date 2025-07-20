-- Create functions for depreciation settings management
CREATE OR REPLACE FUNCTION public.fetch_depreciation_settings(p_company_id UUID)
RETURNS TABLE (
  id UUID,
  company_id UUID,
  default_depreciation_method TEXT,
  default_depreciation_years INTEGER,
  default_salvage_percentage NUMERIC,
  auto_calculate_depreciation BOOLEAN,
  monthly_calculation_day INTEGER,
  include_partial_months BOOLEAN,
  round_to_nearest_dollar BOOLEAN,
  fiscal_year_start_month INTEGER,
  created_at TIMESTAMP WITH TIME ZONE,
  updated_at TIMESTAMP WITH TIME ZONE
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT ds.id, ds.company_id, ds.default_depreciation_method, ds.default_depreciation_years,
         ds.default_salvage_percentage, ds.auto_calculate_depreciation, ds.monthly_calculation_day,
         ds.include_partial_months, ds.round_to_nearest_dollar, ds.fiscal_year_start_month,
         ds.created_at, ds.updated_at
  FROM public.depreciation_settings ds
  WHERE ds.company_id = p_company_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.upsert_depreciation_settings(
  p_company_id UUID,
  p_default_depreciation_method TEXT,
  p_default_depreciation_years INTEGER,
  p_default_salvage_percentage NUMERIC,
  p_auto_calculate_depreciation BOOLEAN,
  p_monthly_calculation_day INTEGER,
  p_include_partial_months BOOLEAN,
  p_round_to_nearest_dollar BOOLEAN,
  p_fiscal_year_start_month INTEGER
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  result_id UUID;
BEGIN
  INSERT INTO public.depreciation_settings (
    company_id, default_depreciation_method, default_depreciation_years,
    default_salvage_percentage, auto_calculate_depreciation, monthly_calculation_day,
    include_partial_months, round_to_nearest_dollar, fiscal_year_start_month,
    updated_at
  )
  VALUES (
    p_company_id, p_default_depreciation_method, p_default_depreciation_years,
    p_default_salvage_percentage, p_auto_calculate_depreciation, p_monthly_calculation_day,
    p_include_partial_months, p_round_to_nearest_dollar, p_fiscal_year_start_month,
    now()
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
    updated_at = now()
  RETURNING id INTO result_id;
  
  RETURN result_id;
END;
$$;