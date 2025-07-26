-- Create a robust depreciation catchup function that properly handles missing entries
CREATE OR REPLACE FUNCTION public.catch_up_cow_depreciation_to_date(
  p_cow_id text, 
  p_target_date date
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  cow_record RECORD;
  missing_month_record RECORD;
  monthly_depreciation NUMERIC;
  entries_created INTEGER := 0;
  total_depreciation_created NUMERIC := 0;
  journal_entry_id UUID;
  first_missing_date DATE;
  last_complete_date DATE;
BEGIN
  -- Get cow details
  SELECT c.id, c.tag_number, c.purchase_price, c.salvage_value, c.freshen_date, c.company_id
  INTO cow_record
  FROM public.cows c
  WHERE c.id = p_cow_id;
  
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Cow not found');
  END IF;
  
  -- Calculate monthly depreciation rate
  monthly_depreciation := ROUND((cow_record.purchase_price - cow_record.salvage_value) / 60.0, 2);
  
  -- Find the last date we have depreciation recorded
  SELECT MAX(je.entry_date) INTO last_complete_date
  FROM public.journal_lines jl
  JOIN public.journal_entries je ON je.id = jl.journal_entry_id
  WHERE jl.cow_id = p_cow_id
    AND jl.account_code = '1500.1'
    AND jl.line_type = 'credit'
    AND je.entry_type = 'depreciation';
  
  -- If no depreciation exists, start from first month after freshen
  IF last_complete_date IS NULL THEN
    first_missing_date := (DATE_TRUNC('month', cow_record.freshen_date) + INTERVAL '1 month - 1 day')::date;
  ELSE
    -- Start from the month after the last recorded depreciation
    first_missing_date := (last_complete_date + INTERVAL '1 month')::date;
    first_missing_date := (DATE_TRUNC('month', first_missing_date) + INTERVAL '1 month - 1 day')::date;
  END IF;
  
  -- Create missing depreciation entries month by month
  WHILE first_missing_date <= p_target_date LOOP
    -- Check if we've hit the 60-month limit
    DECLARE
      months_from_freshen INTEGER;
      existing_depreciation NUMERIC;
      max_depreciation NUMERIC;
    BEGIN
      -- Calculate months from freshen to this date
      months_from_freshen := (EXTRACT(YEAR FROM first_missing_date) - EXTRACT(YEAR FROM cow_record.freshen_date)) * 12 + 
                            (EXTRACT(MONTH FROM first_missing_date) - EXTRACT(MONTH FROM cow_record.freshen_date));
      
      -- Stop if we've reached 60 months
      IF months_from_freshen >= 60 THEN
        EXIT;
      END IF;
      
      -- Check current total depreciation to ensure we don't exceed max
      SELECT COALESCE(SUM(jl.credit_amount), 0) INTO existing_depreciation
      FROM public.journal_lines jl
      JOIN public.journal_entries je ON je.id = jl.journal_entry_id
      WHERE jl.cow_id = p_cow_id
        AND jl.account_code = '1500.1'
        AND jl.line_type = 'credit'
        AND je.entry_type = 'depreciation';
      
      max_depreciation := cow_record.purchase_price - cow_record.salvage_value;
      
      -- Stop if adding this month's depreciation would exceed the maximum
      IF existing_depreciation + monthly_depreciation > max_depreciation THEN
        EXIT;
      END IF;
      
      -- Create journal entry for this month
      INSERT INTO public.journal_entries (
        company_id, entry_date, month, year, entry_type, description, total_amount
      ) VALUES (
        cow_record.company_id,
        first_missing_date,
        EXTRACT(MONTH FROM first_missing_date),
        EXTRACT(YEAR FROM first_missing_date),
        'depreciation',
        'Monthly depreciation - Cow #' || cow_record.tag_number || ' (catchup)',
        monthly_depreciation
      ) RETURNING id INTO journal_entry_id;
      
      -- Create debit line for depreciation expense
      INSERT INTO public.journal_lines (
        journal_entry_id, account_code, account_name, description, debit_amount, credit_amount, line_type, cow_id
      ) VALUES (
        journal_entry_id, 
        '6100', 
        'Depreciation Expense', 
        'Monthly depreciation catchup - Cow #' || cow_record.tag_number, 
        monthly_depreciation, 
        0, 
        'debit',
        p_cow_id
      );
      
      -- Create credit line for accumulated depreciation
      INSERT INTO public.journal_lines (
        journal_entry_id, account_code, account_name, description, debit_amount, credit_amount, line_type, cow_id
      ) VALUES (
        journal_entry_id, 
        '1500.1', 
        'Accumulated Depreciation - Dairy Cows', 
        'Monthly depreciation catchup - Cow #' || cow_record.tag_number, 
        0, 
        monthly_depreciation, 
        'credit',
        p_cow_id
      );
      
      entries_created := entries_created + 1;
      total_depreciation_created := total_depreciation_created + monthly_depreciation;
    END;
    
    -- Move to next month
    first_missing_date := (DATE_TRUNC('month', first_missing_date + INTERVAL '1 month') + INTERVAL '1 month - 1 day')::date;
  END LOOP;
  
  RETURN jsonb_build_object(
    'success', true,
    'entries_created', entries_created,
    'total_depreciation_created', total_depreciation_created,
    'monthly_rate', monthly_depreciation
  );
  
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object(
    'success', false,
    'error', SQLERRM
  );
END;
$function$;