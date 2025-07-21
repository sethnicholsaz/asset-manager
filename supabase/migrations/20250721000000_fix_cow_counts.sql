-- Fix cow count discrepancies with server-side functions

-- Function to get accurate active cow count
CREATE OR REPLACE FUNCTION get_accurate_cow_stats(p_company_id UUID)
RETURNS TABLE (
  active_count BIGINT,
  total_asset_value NUMERIC,
  total_current_value NUMERIC,
  total_depreciation NUMERIC,
  inactive_count BIGINT,
  total_cows BIGINT
) 
LANGUAGE sql
STABLE
AS $$
  SELECT 
    COUNT(*) FILTER (WHERE status = 'active') as active_count,
    COALESCE(SUM(purchase_price) FILTER (WHERE status = 'active'), 0) as total_asset_value,
    COALESCE(SUM(current_value) FILTER (WHERE status = 'active'), 0) as total_current_value,
    COALESCE(SUM(total_depreciation) FILTER (WHERE status = 'active'), 0) as total_depreciation,
    COUNT(*) FILTER (WHERE status != 'active') as inactive_count,
    COUNT(*) as total_cows
  FROM cows 
  WHERE company_id = p_company_id;
$$;

-- Function for reconciliation with proper counting
CREATE OR REPLACE FUNCTION get_monthly_reconciliation(
  p_company_id UUID,
  p_year INT
)
RETURNS TABLE (
  month_num INT,
  year_num INT,
  starting_balance BIGINT,
  additions BIGINT,
  disposals BIGINT,
  ending_balance BIGINT,
  actual_active_count BIGINT
)
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  running_balance BIGINT := 0;
  month_iter INT;
BEGIN
  -- Calculate starting balance for the year (cows active at end of previous year)
  SELECT COUNT(*) INTO running_balance
  FROM cows c
  WHERE c.company_id = p_company_id
    AND c.status = 'active'
    AND c.freshen_date <= (p_year || '-01-01')::DATE - INTERVAL '1 day'
    AND (c.disposition_id IS NULL OR 
         (SELECT disposition_date FROM cow_dispositions cd WHERE cd.id = c.disposition_id) >= (p_year || '-01-01')::DATE);

  -- Loop through each month
  FOR month_iter IN 1..12 LOOP
    DECLARE
      month_start DATE := (p_year || '-' || LPAD(month_iter::TEXT, 2, '0') || '-01')::DATE;
      month_end DATE := (month_start + INTERVAL '1 month - 1 day')::DATE;
      monthly_additions BIGINT;
      monthly_disposals BIGINT;
      current_active BIGINT;
    BEGIN
      -- New cows added this month (freshened)
      SELECT COUNT(*) INTO monthly_additions
      FROM cows c
      WHERE c.company_id = p_company_id
        AND c.freshen_date >= month_start
        AND c.freshen_date <= month_end;

      -- Disposals this month
      SELECT COUNT(*) INTO monthly_disposals
      FROM cow_dispositions cd
      WHERE cd.company_id = p_company_id
        AND cd.disposition_date >= month_start
        AND cd.disposition_date <= month_end;

      -- Actual active count at month end
      SELECT COUNT(*) INTO current_active
      FROM cows c
      WHERE c.company_id = p_company_id
        AND c.status = 'active'
        AND c.freshen_date <= month_end
        AND (c.disposition_id IS NULL OR 
             (SELECT disposition_date FROM cow_dispositions cd WHERE cd.id = c.disposition_id) > month_end);

      -- Return the row
      month_num := month_iter;
      year_num := p_year;
      starting_balance := running_balance;
      additions := monthly_additions;
      disposals := monthly_disposals;
      ending_balance := running_balance + monthly_additions - monthly_disposals;
      actual_active_count := current_active;

      RETURN NEXT;

      -- Update running balance for next month
      running_balance := ending_balance;
    END;
  END LOOP;
END;
$$;

-- Grant permissions
GRANT EXECUTE ON FUNCTION get_accurate_cow_stats(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION get_monthly_reconciliation(UUID, INT) TO authenticated;