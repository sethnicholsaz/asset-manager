-- Update functions to handle the new historical_processing_completed field

-- Drop and recreate fetch_depreciation_settings
DROP FUNCTION IF EXISTS public.fetch_depreciation_settings(uuid);

CREATE OR REPLACE FUNCTION public.fetch_depreciation_settings(p_company_id uuid)
 RETURNS TABLE(
   id uuid,
   company_id uuid,
   default_depreciation_method text,
   default_depreciation_years integer,
   default_salvage_percentage numeric,
   auto_calculate_depreciation boolean,
   monthly_calculation_day integer,
   journal_processing_day integer,
   include_partial_months boolean,
   round_to_nearest_dollar boolean,
   fiscal_year_start_month integer,
   processing_mode text,
   historical_processing_completed boolean,
   created_at timestamp with time zone,
   updated_at timestamp with time zone
 )
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
  RETURN QUERY
  SELECT 
    ds.id,
    ds.company_id,
    ds.default_depreciation_method,
    ds.default_depreciation_years,
    ds.default_salvage_percentage,
    ds.auto_calculate_depreciation,
    ds.monthly_calculation_day,
    ds.journal_processing_day,
    ds.include_partial_months,
    ds.round_to_nearest_dollar,
    ds.fiscal_year_start_month,
    ds.processing_mode,
    ds.historical_processing_completed,
    ds.created_at,
    ds.updated_at
  FROM public.depreciation_settings ds
  WHERE ds.company_id = p_company_id;
END;
$function$;

-- Update upsert_depreciation_settings
DROP FUNCTION IF EXISTS public.upsert_depreciation_settings(uuid, text, integer, numeric, boolean, integer, boolean, boolean, integer, integer, text);

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
  p_journal_processing_day integer,
  p_processing_mode text DEFAULT 'historical',
  p_historical_processing_completed boolean DEFAULT false
)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  result_id uuid;
BEGIN
  INSERT INTO public.depreciation_settings (
    company_id,
    default_depreciation_method,
    default_depreciation_years,
    default_salvage_percentage,
    auto_calculate_depreciation,
    monthly_calculation_day,
    include_partial_months,
    round_to_nearest_dollar,
    fiscal_year_start_month,
    journal_processing_day,
    processing_mode,
    historical_processing_completed,
    updated_at
  ) VALUES (
    p_company_id,
    p_default_depreciation_method,
    p_default_depreciation_years,
    p_default_salvage_percentage,
    p_auto_calculate_depreciation,
    p_monthly_calculation_day,
    p_include_partial_months,
    p_round_to_nearest_dollar,
    p_fiscal_year_start_month,
    p_journal_processing_day,
    p_processing_mode,
    p_historical_processing_completed,
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
    journal_processing_day = EXCLUDED.journal_processing_day,
    processing_mode = EXCLUDED.processing_mode,
    historical_processing_completed = EXCLUDED.historical_processing_completed,
    updated_at = now()
  RETURNING id INTO result_id;
  
  RETURN result_id;
END;
$function$;