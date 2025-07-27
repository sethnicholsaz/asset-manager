-- Fix the enhanced disposition function to use full schema name for catchup function
-- The function is failing because it can't find the catchup function without the schema prefix

CREATE OR REPLACE FUNCTION public.process_disposition_journal_enhanced(p_disposition_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  disposition_record RECORD;
  cow_record RECORD;
  catchup_result JSONB;
  new_journal_entry_id UUID;
  actual_accumulated_depreciation NUMERIC := 0;
  partial_month_depreciation NUMERIC := 0;
  calculated_book_value NUMERIC;
  gain_loss NUMERIC;
  cleanup_count INTEGER := 0;
  disposition_month_start DATE;
  disposition_month_end DATE;
  existing_partial_entry BOOLEAN := FALSE;
BEGIN
  -- Get disposition details with explicit table aliases to avoid ambiguity
  SELECT 
    cd.id, 
    cd.cow_id, 
    cd.disposition_type, 
    cd.disposition_date, 
    cd.sale_amount, 
    cd.final_book_value,
    cd.company_id, 
    cd.journal_entry_id,
    c.tag_number, 
    c.purchase_price, 
    c.current_value, 
    c.total_depreciation, 
    c.salvage_value, 
    c.freshen_date
  INTO disposition_record
  FROM public.cow_dispositions cd
  JOIN public.cows c ON c.id = cd.cow_id
  WHERE cd.id = p_disposition_id;
  
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Disposition not found');
  END IF;

  -- CRITICAL: FIRST ensure all depreciation entries exist up to the disposition date
  SELECT public.catch_up_cow_depreciation_to_date(disposition_record.cow_id, disposition_record.disposition_date) 
  INTO catchup_result;
  
  IF NOT (catchup_result->>'success')::BOOLEAN THEN
    RETURN jsonb_build_object(
      'success', false, 
      'error', 'Failed to catch up depreciation: ' || (catchup_result->>'error')
    );
  END IF;

  -- Calculate disposition month boundaries
  disposition_month_start := DATE_TRUNC('month', disposition_record.disposition_date)::date;
  disposition_month_end := (disposition_month_start + INTERVAL '1 month - 1 day')::date;
  
  -- CRITICAL: Clean up any future depreciation entries for this cow
  WITH cleanup_entries AS (
    DELETE FROM public.journal_lines jl
    USING public.journal_entries je
    WHERE jl.journal_entry_id = je.id
      AND jl.cow_id = disposition_record.cow_id
      AND je.entry_type = 'depreciation'
      AND je.entry_date > disposition_record.disposition_date
    RETURNING jl.journal_entry_id
  ),
  empty_journals AS (
    DELETE FROM public.journal_entries je
    WHERE je.id IN (SELECT DISTINCT journal_entry_id FROM cleanup_entries)
      AND NOT EXISTS (
        SELECT 1 FROM public.journal_lines jl2 
        WHERE jl2.journal_entry_id = je.id
      )
    RETURNING 1
  )
  SELECT COUNT(*) INTO cleanup_count FROM empty_journals;

  -- Get ACTUAL accumulated depreciation from journal entries UP TO disposition date only
  SELECT COALESCE(SUM(jl.credit_amount), 0) INTO actual_accumulated_depreciation
  FROM public.journal_lines jl
  JOIN public.journal_entries je ON je.id = jl.journal_entry_id
  WHERE jl.cow_id = disposition_record.cow_id
    AND jl.account_code = '1500.1'
    AND jl.account_name = 'Accumulated Depreciation - Dairy Cows'
    AND jl.line_type = 'credit'
    AND je.entry_type = 'depreciation'
    AND je.entry_date <= disposition_record.disposition_date;

  -- Check if disposition is mid-month and calculate partial month depreciation
  IF EXTRACT(DAY FROM disposition_record.disposition_date) < EXTRACT(DAY FROM disposition_month_end) THEN
    -- Calculate partial month depreciation
    partial_month_depreciation := public.calculate_partial_month_depreciation_enhanced(
      disposition_record.purchase_price,
      disposition_record.salvage_value,
      disposition_record.disposition_date
    );
    
    -- Check if we already have a full month entry for this month
    SELECT EXISTS (
      SELECT 1 FROM public.journal_lines jl
      JOIN public.journal_entries je ON je.id = jl.journal_entry_id
      WHERE jl.cow_id = disposition_record.cow_id
        AND je.entry_type = 'depreciation'
        AND je.entry_date = disposition_month_end
        AND jl.account_code = '1500.1'
        AND jl.line_type = 'credit'
    ) INTO existing_partial_entry;
    
    -- If we have a full month entry, we need to adjust it to partial month
    IF existing_partial_entry THEN
      -- Update the existing entry to reflect partial month depreciation
      UPDATE public.journal_lines 
      SET credit_amount = partial_month_depreciation,
          description = 'Partial month depreciation - Cow #' || disposition_record.tag_number || 
                       ' (' || TO_CHAR(disposition_record.disposition_date, 'Mon DD, YYYY') || ')'
      WHERE journal_entry_id IN (
        SELECT je.id FROM public.journal_entries je
        WHERE je.entry_type = 'depreciation'
          AND je.entry_date = disposition_month_end
          AND je.company_id = disposition_record.company_id
      )
      AND cow_id = disposition_record.cow_id
      AND account_code = '1500.1'
      AND line_type = 'credit';
      
      -- Update the corresponding debit entry
      UPDATE public.journal_lines 
      SET debit_amount = partial_month_depreciation,
          description = 'Partial month depreciation - Cow #' || disposition_record.tag_number || 
                       ' (' || TO_CHAR(disposition_record.disposition_date, 'Mon DD, YYYY') || ')'
      WHERE journal_entry_id IN (
        SELECT je.id FROM public.journal_entries je
        WHERE je.entry_type = 'depreciation'
          AND je.entry_date = disposition_month_end
          AND je.company_id = disposition_record.company_id
      )
      AND cow_id = disposition_record.cow_id
      AND account_code = '6100'
      AND line_type = 'debit';
      
      -- Update journal entry total amount
      UPDATE public.journal_entries 
      SET total_amount = partial_month_depreciation,
          description = 'Partial month depreciation - ' || TO_CHAR(disposition_record.disposition_date, 'Month YYYY') || 
                       ' (Adjusted for disposition)'
      WHERE entry_type = 'depreciation'
        AND entry_date = disposition_month_end
        AND company_id = disposition_record.company_id
        AND id IN (
          SELECT DISTINCT jl.journal_entry_id 
          FROM public.journal_lines jl
          WHERE jl.cow_id = disposition_record.cow_id
            AND jl.account_code = '1500.1'
            AND jl.line_type = 'credit'
        );
    ELSE
      -- Create new partial month depreciation entry
      INSERT INTO public.journal_entries (
        company_id, entry_date, month, year, entry_type, description, total_amount
      ) VALUES (
        disposition_record.company_id,
        disposition_record.disposition_date,
        EXTRACT(MONTH FROM disposition_record.disposition_date),
        EXTRACT(YEAR FROM disposition_record.disposition_date),
        'depreciation',
        'Partial month depreciation - ' || TO_CHAR(disposition_record.disposition_date, 'Month YYYY') || 
        ' (Disposition day ' || EXTRACT(DAY FROM disposition_record.disposition_date) || ')',
        partial_month_depreciation
      ) RETURNING id INTO new_journal_entry_id;
      
      -- Create debit line for depreciation expense
      INSERT INTO public.journal_lines (
        journal_entry_id, account_code, account_name, description, debit_amount, credit_amount, line_type, cow_id
      ) VALUES (
        new_journal_entry_id, 
        '6100', 
        'Depreciation Expense', 
        'Partial month depreciation - Cow #' || disposition_record.tag_number || 
        ' (' || TO_CHAR(disposition_record.disposition_date, 'Mon DD, YYYY') || ')', 
        partial_month_depreciation, 
        0, 
        'debit',
        disposition_record.cow_id
      );
      
      -- Create credit line for accumulated depreciation
      INSERT INTO public.journal_lines (
        journal_entry_id, account_code, account_name, description, debit_amount, credit_amount, line_type, cow_id
      ) VALUES (
        new_journal_entry_id, 
        '1500.1', 
        'Accumulated Depreciation - Dairy Cows', 
        'Partial month depreciation - Cow #' || disposition_record.tag_number || 
        ' (' || TO_CHAR(disposition_record.disposition_date, 'Mon DD, YYYY') || ')', 
        0, 
        partial_month_depreciation, 
        'credit',
        disposition_record.cow_id
      );
    END IF;
    
    -- Recalculate accumulated depreciation including the partial month
    SELECT COALESCE(SUM(jl.credit_amount), 0) INTO actual_accumulated_depreciation
    FROM public.journal_lines jl
    JOIN public.journal_entries je ON je.id = jl.journal_entry_id
    WHERE jl.cow_id = disposition_record.cow_id
      AND jl.account_code = '1500.1'
      AND jl.account_name = 'Accumulated Depreciation - Dairy Cows'
      AND jl.line_type = 'credit'
      AND je.entry_type = 'depreciation'
      AND je.entry_date <= disposition_record.disposition_date;
  END IF;

  -- Calculate the actual book value based on recorded depreciation
  calculated_book_value := disposition_record.purchase_price - actual_accumulated_depreciation;
  
  -- Ensure book value doesn't go below salvage value
  calculated_book_value := GREATEST(calculated_book_value, disposition_record.salvage_value);
  
  -- Calculate gain/loss based on actual book value
  gain_loss := COALESCE(disposition_record.sale_amount, 0) - calculated_book_value;

  -- Delete existing journal entry if it exists
  IF disposition_record.journal_entry_id IS NOT NULL THEN
    DELETE FROM public.journal_lines WHERE journal_entry_id = disposition_record.journal_entry_id;
    DELETE FROM public.journal_entries WHERE id = disposition_record.journal_entry_id;
  END IF;

  -- Create journal entry for disposition
  INSERT INTO public.journal_entries (
    company_id, entry_date, month, year, entry_type, description, total_amount
  ) VALUES (
    disposition_record.company_id,
    disposition_record.disposition_date,
    EXTRACT(MONTH FROM disposition_record.disposition_date),
    EXTRACT(YEAR FROM disposition_record.disposition_date),
    'disposition',
    'Asset Disposition - Cow #' || disposition_record.tag_number || ' (' || disposition_record.disposition_type || ')',
    disposition_record.purchase_price
  ) RETURNING id INTO new_journal_entry_id;

  -- Create journal lines for disposition
  
  -- 1. Remove accumulated depreciation (debit)
  INSERT INTO public.journal_lines (
    journal_entry_id, account_code, account_name, description, debit_amount, credit_amount, line_type, cow_id
  ) VALUES (
    new_journal_entry_id, 
    '1500.1', 
    'Accumulated Depreciation - Dairy Cows', 
    'Remove accumulated depreciation - Cow #' || disposition_record.tag_number, 
    actual_accumulated_depreciation, 
    0, 
    'debit',
    disposition_record.cow_id
  );

  -- 2. Remove asset (credit)
  INSERT INTO public.journal_lines (
    journal_entry_id, account_code, account_name, description, debit_amount, credit_amount, line_type, cow_id
  ) VALUES (
    new_journal_entry_id, 
    '1500', 
    'Dairy Cows', 
    'Remove asset - Cow #' || disposition_record.tag_number, 
    0, 
    disposition_record.purchase_price, 
    'credit',
    disposition_record.cow_id
  );

  -- 3. Record cash receipt (if sale)
  IF disposition_record.disposition_type = 'sale' AND COALESCE(disposition_record.sale_amount, 0) > 0 THEN
    INSERT INTO public.journal_lines (
      journal_entry_id, account_code, account_name, description, debit_amount, credit_amount, line_type, cow_id
    ) VALUES (
      new_journal_entry_id, 
      '1000', 
      'Cash', 
      'Cash receipt from sale - Cow #' || disposition_record.tag_number, 
      disposition_record.sale_amount, 
      0, 
      'debit',
      disposition_record.cow_id
    );
  END IF;

  -- 4. Record gain/loss
  IF gain_loss != 0 THEN
    INSERT INTO public.journal_lines (
      journal_entry_id, account_code, account_name, description, debit_amount, credit_amount, line_type, cow_id
    ) VALUES (
      new_journal_entry_id, 
      CASE WHEN gain_loss > 0 THEN '4400' ELSE '4500' END, 
      CASE WHEN gain_loss > 0 THEN 'Gain on Sale of Assets' ELSE 'Loss on Sale of Assets' END, 
      CASE WHEN gain_loss > 0 THEN 'Gain on sale' ELSE 'Loss on sale' END || ' - Cow #' || disposition_record.tag_number, 
      CASE WHEN gain_loss > 0 THEN 0 ELSE ABS(gain_loss) END, 
      CASE WHEN gain_loss > 0 THEN gain_loss ELSE 0 END, 
      CASE WHEN gain_loss > 0 THEN 'credit' ELSE 'debit' END,
      disposition_record.cow_id
    );
  END IF;

  -- Update disposition with journal entry ID and calculated values
  UPDATE public.cow_dispositions 
  SET journal_entry_id = new_journal_entry_id,
      final_book_value = calculated_book_value,
      gain_loss = gain_loss
  WHERE id = p_disposition_id;

  RETURN jsonb_build_object(
    'success', true,
    'journal_entry_id', new_journal_entry_id,
    'total_amount', disposition_record.purchase_price,
    'actual_accumulated_depreciation', actual_accumulated_depreciation,
    'actual_book_value', calculated_book_value,
    'gain_loss', gain_loss,
    'partial_month_depreciation', partial_month_depreciation,
    'cleanup_count', cleanup_count,
    'disposition_day', EXTRACT(DAY FROM disposition_record.disposition_date),
    'days_in_month', EXTRACT(DAY FROM disposition_month_end),
    'catchup_result', catchup_result
  );

EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object(
    'success', false,
    'error', SQLERRM
  );
END;
$function$; 