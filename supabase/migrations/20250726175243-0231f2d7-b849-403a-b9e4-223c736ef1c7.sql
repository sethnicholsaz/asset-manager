-- Create a function to calculate partial month depreciation up to disposition date
CREATE OR REPLACE FUNCTION public.calculate_partial_month_depreciation(
  p_purchase_price numeric, 
  p_salvage_value numeric, 
  p_start_date date, 
  p_end_date date
)
RETURNS numeric
LANGUAGE plpgsql
IMMUTABLE
SET search_path TO ''
AS $function$
DECLARE
  monthly_depreciation NUMERIC;
  days_in_month INTEGER;
  days_elapsed INTEGER;
  partial_depreciation NUMERIC;
BEGIN
  -- Calculate monthly straight-line depreciation (5 years)
  monthly_depreciation := ROUND((p_purchase_price - p_salvage_value) / (5 * 12), 2);
  
  -- Get days in the month and days elapsed from start to end
  days_in_month := EXTRACT(DAY FROM (DATE_TRUNC('month', p_end_date) + INTERVAL '1 month - 1 day'));
  days_elapsed := EXTRACT(DAY FROM p_end_date) - EXTRACT(DAY FROM p_start_date) + 1;
  
  -- Calculate partial depreciation based on days
  partial_depreciation := ROUND(monthly_depreciation * days_elapsed / days_in_month, 2);
  
  RETURN partial_depreciation;
END;
$function$;

-- Update the disposition processing function to include partial month depreciation
CREATE OR REPLACE FUNCTION public.process_disposition_with_partial_depreciation(p_disposition_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  disposition_record RECORD;
  cow_record RECORD;
  new_journal_entry_id UUID;
  partial_depreciation_entry_id UUID;
  actual_accumulated_depreciation NUMERIC := 0;
  partial_month_depreciation NUMERIC := 0;
  gain_loss NUMERIC;
  actual_book_value NUMERIC;
  first_of_month DATE;
BEGIN
  -- Get disposition details
  SELECT cd.id, cd.cow_id, cd.disposition_type, cd.disposition_date, cd.sale_amount, cd.final_book_value,
         cd.company_id, cd.journal_entry_id,
         c.tag_number, c.purchase_price, c.current_value, c.total_depreciation, c.salvage_value, c.freshen_date
  INTO disposition_record
  FROM public.cow_dispositions cd
  JOIN public.cows c ON c.id = cd.cow_id
  WHERE cd.id = p_disposition_id;
  
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Disposition not found');
  END IF;
  
  -- Calculate first day of disposition month
  first_of_month := DATE_TRUNC('month', disposition_record.disposition_date)::date;
  
  -- Calculate partial month depreciation if disposition occurred after month start
  IF disposition_record.disposition_date > first_of_month AND disposition_record.freshen_date < first_of_month THEN
    partial_month_depreciation := public.calculate_partial_month_depreciation(
      disposition_record.purchase_price,
      disposition_record.salvage_value,
      first_of_month,
      disposition_record.disposition_date
    );
    
    -- Create partial month depreciation entry if there's depreciation to record
    IF partial_month_depreciation > 0 THEN
      INSERT INTO public.journal_entries (
        company_id, entry_date, month, year, entry_type, description, total_amount
      ) VALUES (
        disposition_record.company_id,
        disposition_record.disposition_date,
        EXTRACT(MONTH FROM disposition_record.disposition_date),
        EXTRACT(YEAR FROM disposition_record.disposition_date),
        'depreciation',
        'Partial month depreciation - Cow #' || disposition_record.tag_number || ' (through ' || disposition_record.disposition_date || ')',
        partial_month_depreciation
      ) RETURNING id INTO partial_depreciation_entry_id;
      
      -- Create journal lines for partial depreciation
      INSERT INTO public.journal_lines (
        journal_entry_id, account_code, account_name, description, debit_amount, credit_amount, line_type, cow_id
      ) VALUES (
        partial_depreciation_entry_id, 
        '6100', 
        'Depreciation Expense', 
        'Partial month depreciation - Cow #' || disposition_record.tag_number, 
        partial_month_depreciation, 
        0, 
        'debit',
        disposition_record.cow_id
      );
      
      INSERT INTO public.journal_lines (
        journal_entry_id, account_code, account_name, description, debit_amount, credit_amount, line_type, cow_id
      ) VALUES (
        partial_depreciation_entry_id, 
        '1500.1', 
        'Accumulated Depreciation - Dairy Cows', 
        'Partial month depreciation - Cow #' || disposition_record.tag_number, 
        0, 
        partial_month_depreciation, 
        'credit',
        disposition_record.cow_id
      );
    END IF;
  END IF;
  
  -- Get ACTUAL accumulated depreciation from all journal entries including partial
  SELECT COALESCE(SUM(jl.credit_amount), 0) INTO actual_accumulated_depreciation
  FROM public.journal_lines jl
  JOIN public.journal_entries je ON je.id = jl.journal_entry_id
  WHERE jl.cow_id = disposition_record.cow_id
    AND jl.account_code = '1500.1'
    AND jl.account_name = 'Accumulated Depreciation - Dairy Cows'
    AND jl.line_type = 'credit'
    AND je.entry_type = 'depreciation'
    AND je.entry_date <= disposition_record.disposition_date;
  
  -- Calculate actual book value and gain/loss
  actual_book_value := ROUND(disposition_record.purchase_price - actual_accumulated_depreciation, 2);
  gain_loss := ROUND(COALESCE(disposition_record.sale_amount, 0) - actual_book_value, 2);
  
  -- Delete existing disposition journal entry if it exists
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
  
  -- Create journal lines for disposition (same as before but with updated accumulated depreciation)
  
  -- 1. Remove accumulated depreciation (debit) - only if there is any
  IF actual_accumulated_depreciation > 0 THEN
    INSERT INTO public.journal_lines (
      journal_entry_id, account_code, account_name, description, debit_amount, credit_amount, line_type, cow_id
    ) VALUES (
      new_journal_entry_id, 
      '1500.1', 
      'Accumulated Depreciation - Dairy Cows', 
      'Remove accumulated depreciation - Cow #' || disposition_record.tag_number || ' ($' || actual_accumulated_depreciation || ')', 
      actual_accumulated_depreciation, 
      0, 
      'debit',
      disposition_record.cow_id
    );
  END IF;
  
  -- 2. Record cash received (if sale and sale amount > 0)
  IF disposition_record.disposition_type = 'sale' AND COALESCE(disposition_record.sale_amount, 0) > 0 THEN
    INSERT INTO public.journal_lines (
      journal_entry_id, account_code, account_name, description, debit_amount, credit_amount, line_type, cow_id
    ) VALUES (
      new_journal_entry_id, 
      '1000', 
      'Cash', 
      'Cash received from sale - Cow #' || disposition_record.tag_number, 
      disposition_record.sale_amount, 
      0, 
      'debit',
      disposition_record.cow_id
    );
  END IF;
  
  -- 3. Record gain or loss
  IF ABS(gain_loss) > 0.01 THEN
    DECLARE
      account_code TEXT;
      account_name TEXT;
    BEGIN
      -- Determine the correct account based on disposition type and gain/loss
      IF disposition_record.disposition_type = 'sale' THEN
        IF gain_loss > 0 THEN
          account_code := '8000';
          account_name := 'Gain on Sale of Cows';
        ELSE
          account_code := '9002';
          account_name := 'Loss on Sale of Cows';
        END IF;
      ELSIF disposition_record.disposition_type = 'death' THEN
        account_code := '9001';
        account_name := 'Loss on Dead Cows';
      ELSIF disposition_record.disposition_type = 'culled' THEN
        account_code := '9003';
        account_name := 'Loss on Culled Cows';
      ELSE
        account_code := '9000';
        account_name := 'Loss on Sale of Assets';
      END IF;
      
      INSERT INTO public.journal_lines (
        journal_entry_id, account_code, account_name, description, debit_amount, credit_amount, line_type, cow_id
      ) VALUES (
        new_journal_entry_id, 
        account_code, 
        account_name, 
        CASE WHEN gain_loss > 0 THEN 'Gain' ELSE 'Loss' END || ' on ' || disposition_record.disposition_type || ' - Cow #' || disposition_record.tag_number || ' (Book value: $' || actual_book_value || ')', 
        CASE WHEN gain_loss > 0 THEN 0 ELSE ABS(gain_loss) END, 
        CASE WHEN gain_loss > 0 THEN ABS(gain_loss) ELSE 0 END, 
        CASE WHEN gain_loss > 0 THEN 'credit' ELSE 'debit' END,
        disposition_record.cow_id
      );
    END;
  END IF;
  
  -- 4. Remove original asset (credit)
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
  
  -- Update disposition with journal entry ID
  UPDATE public.cow_dispositions 
  SET journal_entry_id = new_journal_entry_id,
      final_book_value = actual_book_value,
      gain_loss = gain_loss
  WHERE id = p_disposition_id;
  
  -- Update cow totals to reflect actual depreciation
  UPDATE public.cows
  SET total_depreciation = ROUND(actual_accumulated_depreciation, 2),
      current_value = ROUND(actual_book_value, 2),
      updated_at = now()
  WHERE id = disposition_record.cow_id;
  
  RETURN jsonb_build_object(
    'success', true,
    'journal_entry_id', new_journal_entry_id,
    'partial_depreciation_entry_id', partial_depreciation_entry_id,
    'partial_month_depreciation', partial_month_depreciation,
    'total_amount', disposition_record.purchase_price,
    'actual_accumulated_depreciation', actual_accumulated_depreciation,
    'actual_book_value', actual_book_value,
    'gain_loss', gain_loss
  );
  
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object(
    'success', false,
    'error', SQLERRM
  );
END;
$function$;