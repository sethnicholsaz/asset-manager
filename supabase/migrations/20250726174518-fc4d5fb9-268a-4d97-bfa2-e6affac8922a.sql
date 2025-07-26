-- Update the calculate_cow_monthly_depreciation function to round to the penny
CREATE OR REPLACE FUNCTION public.calculate_cow_monthly_depreciation(p_purchase_price numeric, p_salvage_value numeric, p_freshen_date date, p_target_date date)
 RETURNS numeric
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO ''
AS $function$
DECLARE
  monthly_depreciation NUMERIC;
  months_elapsed INTEGER;
  max_depreciation NUMERIC;
  total_depreciation NUMERIC;
BEGIN
  -- Calculate monthly straight-line depreciation (5 years)
  monthly_depreciation := ROUND((p_purchase_price - p_salvage_value) / (5 * 12), 2);
  
  -- Calculate months elapsed from freshen date to target date
  months_elapsed := (EXTRACT(YEAR FROM p_target_date) - EXTRACT(YEAR FROM p_freshen_date)) * 12 + 
                   (EXTRACT(MONTH FROM p_target_date) - EXTRACT(MONTH FROM p_freshen_date));
  
  -- Ensure months_elapsed is not negative
  months_elapsed := GREATEST(0, months_elapsed);
  
  -- Calculate total depreciation but don't exceed depreciable amount
  max_depreciation := ROUND(p_purchase_price - p_salvage_value, 2);
  total_depreciation := ROUND(LEAST(monthly_depreciation * months_elapsed, max_depreciation), 2);
  
  -- Return monthly depreciation for this specific month
  RETURN CASE 
    WHEN total_depreciation >= max_depreciation THEN 0 -- Already fully depreciated
    ELSE monthly_depreciation
  END;
END;
$function$