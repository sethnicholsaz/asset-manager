-- Fix monthly reconciliation to ensure proper balance flow

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
      calculated_ending BIGINT;
      actual_active BIGINT;
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

      -- Calculate ending balance based on flow
      calculated_ending := running_balance + monthly_additions - monthly_disposals;

      -- Get actual active count at month end for comparison
      SELECT COUNT(*) INTO actual_active
      FROM cows c
      WHERE c.company_id = p_company_id
        AND c.status = 'active'
        AND c.freshen_date <= month_end
        AND (c.disposition_id IS NULL OR 
             (SELECT disposition_date FROM cow_dispositions cd WHERE cd.id = c.disposition_id) > month_end);

      -- Return the row with calculated ending balance (ensures flow)
      month_num := month_iter;
      year_num := p_year;
      starting_balance := running_balance;
      additions := monthly_additions;
      disposals := monthly_disposals;
      ending_balance := calculated_ending; -- Use calculated balance for flow
      actual_active_count := actual_active; -- Show actual for comparison

      RETURN NEXT;

      -- CRITICAL: Use calculated balance for next month's starting balance
      running_balance := calculated_ending;
    END;
  END LOOP;
END;
$$;

-- Grant permissions
GRANT EXECUTE ON FUNCTION get_monthly_reconciliation(UUID, INT) TO authenticated;