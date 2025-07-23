-- Update the dashboard stats function to calculate cow asset value as credits minus debits
CREATE OR REPLACE FUNCTION public.get_dashboard_stats(p_company_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  active_cow_count INTEGER := 0;
  total_asset_value NUMERIC := 0;
  total_accumulated_depreciation NUMERIC := 0;
  depreciation_entries UUID[];
  disposition_entries UUID[];
BEGIN
  -- Get active cow count
  SELECT COUNT(*)
  INTO active_cow_count
  FROM cows 
  WHERE company_id = p_company_id 
    AND status = 'active';
  
  -- Calculate total asset value for Dairy Cows account (1500) as credits minus debits
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
  SELECT (cac.total_credits - cad.total_debits)
  INTO total_asset_value
  FROM cow_asset_credits cac, cow_asset_debits cad;
  
  -- Get depreciation journal entry IDs for this company
  SELECT ARRAY_AGG(id)
  INTO depreciation_entries
  FROM journal_entries 
  WHERE company_id = p_company_id 
    AND entry_type = 'depreciation';
  
  -- Get disposition journal entry IDs for this company
  SELECT ARRAY_AGG(id)
  INTO disposition_entries
  FROM journal_entries 
  WHERE company_id = p_company_id 
    AND entry_type = 'disposition';
  
  -- Calculate accumulated depreciation
  -- Credits from depreciation entries minus debits from disposition entries
  WITH depreciation_credits AS (
    SELECT COALESCE(SUM(credit_amount), 0) as total_credits
    FROM journal_lines jl
    WHERE jl.account_code = '1500.1'
      AND jl.account_name = 'Accumulated Depreciation - Dairy Cows'
      AND jl.line_type = 'credit'
      AND (depreciation_entries IS NULL OR jl.journal_entry_id = ANY(depreciation_entries))
  ),
  disposition_debits AS (
    SELECT COALESCE(SUM(debit_amount), 0) as total_debits
    FROM journal_lines jl
    WHERE jl.account_code = '1500.1'
      AND jl.account_name = 'Accumulated Depreciation - Dairy Cows'
      AND jl.line_type = 'debit'
      AND (disposition_entries IS NULL OR jl.journal_entry_id = ANY(disposition_entries))
  )
  SELECT (dc.total_credits - dd.total_debits)
  INTO total_accumulated_depreciation
  FROM depreciation_credits dc, disposition_debits dd;
  
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
$$;