CREATE OR REPLACE FUNCTION public.get_monthly_reconciliation(p_company_id uuid, p_year integer)
 RETURNS TABLE(month_num integer, year_num integer, starting_balance bigint, additions bigint, sales bigint, deaths bigint, ending_balance bigint, actual_active_count bigint)
 LANGUAGE plpgsql
 STABLE
AS $function$
DECLARE
  running_balance BIGINT := 0;
  month_iter INT;
  current_active_count BIGINT;
  adjustment_needed BIGINT;
  total_net_change BIGINT := 0;
BEGIN
  -- Get current actual active cow count
  SELECT COUNT(*) INTO current_active_count
  FROM cows c
  WHERE c.company_id = p_company_id
    AND c.status = 'active';

  -- Calculate starting balance for the year (cows active at end of previous year)
  SELECT COUNT(*) INTO running_balance
  FROM cows c
  WHERE c.company_id = p_company_id
    AND c.status = 'active'
    AND c.freshen_date <= (p_year || '-01-01')::DATE - INTERVAL '1 day'
    AND (c.disposition_id IS NULL OR 
         (SELECT disposition_date FROM cow_dispositions cd WHERE cd.id = c.disposition_id) >= (p_year || '-01-01')::DATE);

  -- Calculate total net change for the year to determine adjustment
  FOR month_iter IN 1..12 LOOP
    DECLARE
      month_start DATE := (p_year || '-' || LPAD(month_iter::TEXT, 2, '0') || '-01')::DATE;
      month_end DATE := (month_start + INTERVAL '1 month - 1 day')::DATE;
      monthly_additions BIGINT;
      monthly_sales BIGINT;
      monthly_deaths BIGINT;
    BEGIN
      -- New cows added this month
      SELECT COUNT(*) INTO monthly_additions
      FROM cows c
      WHERE c.company_id = p_company_id
        AND c.freshen_date >= month_start
        AND c.freshen_date <= month_end;

      -- Sales this month
      SELECT COUNT(*) INTO monthly_sales
      FROM cow_dispositions cd
      WHERE cd.company_id = p_company_id
        AND cd.disposition_date >= month_start
        AND cd.disposition_date <= month_end
        AND cd.disposition_type = 'sale';

      -- Deaths this month  
      SELECT COUNT(*) INTO monthly_deaths
      FROM cow_dispositions cd
      WHERE cd.company_id = p_company_id
        AND cd.disposition_date >= month_start
        AND cd.disposition_date <= month_end
        AND cd.disposition_type = 'death';

      total_net_change := total_net_change + monthly_additions - monthly_sales - monthly_deaths;
    END;
  END LOOP;

  -- Calculate adjustment needed to match actual count
  adjustment_needed := current_active_count - (running_balance + total_net_change);
  
  -- If there's a significant adjustment needed, apply it to the starting balance
  IF ABS(adjustment_needed) > 0 THEN
    running_balance := running_balance + adjustment_needed;
  END IF;

  -- Now generate the monthly reconciliation with proper flow
  FOR month_iter IN 1..12 LOOP
    DECLARE
      month_start DATE := (p_year || '-' || LPAD(month_iter::TEXT, 2, '0') || '-01')::DATE;
      month_end DATE := (month_start + INTERVAL '1 month - 1 day')::DATE;
      monthly_additions BIGINT;
      monthly_sales BIGINT;
      monthly_deaths BIGINT;
      calculated_ending BIGINT;
      actual_active BIGINT;
    BEGIN
      -- New cows added this month
      SELECT COUNT(*) INTO monthly_additions
      FROM cows c
      WHERE c.company_id = p_company_id
        AND c.freshen_date >= month_start
        AND c.freshen_date <= month_end;

      -- Sales this month
      SELECT COUNT(*) INTO monthly_sales
      FROM cow_dispositions cd
      WHERE cd.company_id = p_company_id
        AND cd.disposition_date >= month_start
        AND cd.disposition_date <= month_end
        AND cd.disposition_type = 'sale';

      -- Deaths this month
      SELECT COUNT(*) INTO monthly_deaths
      FROM cow_dispositions cd
      WHERE cd.company_id = p_company_id
        AND cd.disposition_date >= month_start
        AND cd.disposition_date <= month_end
        AND cd.disposition_type = 'death';

      -- Calculate ending balance based on flow
      calculated_ending := running_balance + monthly_additions - monthly_sales - monthly_deaths;

      -- For the current month (or latest month), use actual count
      IF month_iter = EXTRACT(MONTH FROM CURRENT_DATE) AND p_year = EXTRACT(YEAR FROM CURRENT_DATE) THEN
        calculated_ending := current_active_count;
      END IF;

      -- Get actual active count at month end for comparison
      SELECT COUNT(*) INTO actual_active
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
      sales := monthly_sales;
      deaths := monthly_deaths;
      ending_balance := calculated_ending;
      actual_active_count := actual_active;

      RETURN NEXT;

      -- Use calculated balance for next month's starting balance
      running_balance := calculated_ending;
    END;
  END LOOP;
END;
$function$