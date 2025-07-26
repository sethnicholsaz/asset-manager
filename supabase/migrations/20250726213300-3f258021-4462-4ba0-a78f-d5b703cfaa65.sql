-- Fix the monthly depreciation calculation to prevent over-depreciation
CREATE OR REPLACE FUNCTION public.calculate_cow_monthly_depreciation_fixed(
  p_purchase_price numeric, 
  p_salvage_value numeric, 
  p_freshen_date date, 
  p_target_date date
) RETURNS numeric
LANGUAGE plpgsql
IMMUTABLE
SET search_path TO ''
AS $function$
DECLARE
  monthly_depreciation NUMERIC;
  months_elapsed INTEGER;
  max_depreciation NUMERIC;
  total_possible_depreciation NUMERIC;
BEGIN
  -- Calculate monthly straight-line depreciation (5 years = 60 months)
  monthly_depreciation := ROUND((p_purchase_price - p_salvage_value) / 60.0, 2);
  
  -- Calculate months elapsed from freshen date to target date
  months_elapsed := (EXTRACT(YEAR FROM p_target_date) - EXTRACT(YEAR FROM p_freshen_date)) * 12 + 
                   (EXTRACT(MONTH FROM p_target_date) - EXTRACT(MONTH FROM p_freshen_date));
  
  -- Ensure months_elapsed is not negative
  months_elapsed := GREATEST(0, months_elapsed);
  
  -- Calculate maximum allowable depreciation (total depreciable amount)
  max_depreciation := ROUND(p_purchase_price - p_salvage_value, 2);
  
  -- Calculate what the total depreciation should be at this point
  total_possible_depreciation := ROUND(LEAST(monthly_depreciation * months_elapsed, max_depreciation), 2);
  
  -- CRITICAL FIX: Don't allow depreciation beyond 60 months or beyond the depreciable amount
  IF months_elapsed >= 60 OR total_possible_depreciation >= max_depreciation THEN
    RETURN 0; -- Asset is fully depreciated, no more monthly depreciation
  ELSE
    RETURN monthly_depreciation;
  END IF;
END;
$function$;

-- Update the existing function to use the fixed logic
CREATE OR REPLACE FUNCTION public.calculate_cow_monthly_depreciation(
  p_purchase_price numeric, 
  p_salvage_value numeric, 
  p_freshen_date date, 
  p_target_date date
) RETURNS numeric
LANGUAGE plpgsql
IMMUTABLE
SET search_path TO ''
AS $function$
BEGIN
  -- Use the fixed calculation
  RETURN public.calculate_cow_monthly_depreciation_fixed(
    p_purchase_price, 
    p_salvage_value, 
    p_freshen_date, 
    p_target_date
  );
END;
$function$;