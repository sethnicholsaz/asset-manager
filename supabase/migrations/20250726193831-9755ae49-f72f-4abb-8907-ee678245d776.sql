-- Update get_dashboard_stats function to properly account for all journal entries including reversals
CREATE OR REPLACE FUNCTION public.get_dashboard_stats(p_company_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  active_cow_count INTEGER := 0;
  total_asset_value NUMERIC := 0;
  total_accumulated_depreciation NUMERIC := 0;
BEGIN
  -- Get active cow count
  SELECT COUNT(*)
  INTO active_cow_count
  FROM cows 
  WHERE company_id = p_company_id 
    AND status = 'active';
  
  -- Calculate total asset value for Dairy Cows account (1500) as debits minus credits
  WITH cow_asset_credits AS (
    SELECT COALESCE(SUM(credit_amount), 0) as total_credits
    FROM journal_lines jl
    JOIN journal_entries je ON je.id = jl.journal_entry_id
    WHERE jl.account_code = '1500'
      AND jl.account_name = 'Dairy Cows'
      AND jl.line_type = 'credit'
      AND je.company_id = p_company_id
  ),
  cow_asset_debits AS (
    SELECT COALESCE(SUM(debit_amount), 0) as total_debits
    FROM journal_lines jl
    JOIN journal_entries je ON je.id = jl.journal_entry_id
    WHERE jl.account_code = '1500'
      AND jl.account_name = 'Dairy Cows'
      AND jl.line_type = 'debit'
      AND je.company_id = p_company_id
  )
  SELECT (cad.total_debits - cac.total_credits)
  INTO total_asset_value
  FROM cow_asset_credits cac, cow_asset_debits cad;
  
  -- Calculate accumulated depreciation as ALL credits minus ALL debits for account 1500.1
  -- This properly accounts for reversals, adjustments, and any other journal activity
  WITH accumulated_depreciation_activity AS (
    SELECT 
      COALESCE(SUM(CASE WHEN jl.line_type = 'credit' THEN jl.credit_amount ELSE 0 END), 0) as total_credits,
      COALESCE(SUM(CASE WHEN jl.line_type = 'debit' THEN jl.debit_amount ELSE 0 END), 0) as total_debits
    FROM journal_lines jl
    JOIN journal_entries je ON je.id = jl.journal_entry_id
    WHERE jl.account_code = '1500.1'
      AND jl.account_name = 'Accumulated Depreciation - Dairy Cows'
      AND je.company_id = p_company_id
  )
  SELECT (total_credits - total_debits)
  INTO total_accumulated_depreciation
  FROM accumulated_depreciation_activity;
  
  -- Return the stats as JSON
  RETURN jsonb_build_object(
    'active_cow_count', active_cow_count,
    'total_asset_value', total_asset_value,
    'total_accumulated_depreciation', total_accumulated_depreciation
  );
  
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object(
    'active_cow_count', 0,
    'total_asset_value', 0,
    'total_accumulated_depreciation', 0,
    'error', SQLERRM
  );
END;
$function$;