-- Fix disposition processing to ensure depreciation catch-up before creating disposition journal
-- This ensures ALL monthly depreciation entries exist up to the disposal date

-- Create a function to catch up depreciation for a specific cow up to a target date
CREATE OR REPLACE FUNCTION public.catch_up_cow_depreciation_to_date(p_cow_id text, p_target_date date)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
  cow_record RECORD;
  freshen_date DATE;
  monthly_depreciation NUMERIC;
  current_period DATE;
  end_period DATE;
  period_year INTEGER;
  period_month INTEGER;
  journal_entry_id UUID;
  entries_created INTEGER := 0;
BEGIN
  -- Get cow details
  SELECT * INTO cow_record FROM cows WHERE id = p_cow_id;
  
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Cow not found');
  END IF;
  
  freshen_date := cow_record.freshen_date;
  monthly_depreciation := (cow_record.purchase_price - cow_record.salvage_value) / (5 * 12);
  
  -- Start from the month after freshen date
  current_period := date_trunc('month', freshen_date);
  end_period := date_trunc('month', p_target_date);
  
  WHILE current_period <= end_period LOOP
    period_year := EXTRACT(YEAR FROM current_period);
    period_month := EXTRACT(MONTH FROM current_period);
    
    -- Check if depreciation entry already exists for this period
    IF NOT EXISTS (
      SELECT 1 FROM journal_entries je
      JOIN journal_lines jl ON jl.journal_entry_id = je.id
      WHERE je.company_id = cow_record.company_id
        AND je.entry_type = 'depreciation'
        AND je.year = period_year
        AND je.month = period_month
        AND jl.cow_id = p_cow_id
        AND jl.account_code = '1500.1'
    ) THEN
      -- Create monthly depreciation entry
      INSERT INTO journal_entries (
        company_id, entry_date, month, year, entry_type, description, total_amount
      ) VALUES (
        cow_record.company_id,
        (current_period + INTERVAL '1 month - 1 day')::date,
        period_month,
        period_year,
        'depreciation',
        'Monthly Depreciation - ' || period_year || '-' || LPAD(period_month::text, 2, '0') || ' - Cow #' || cow_record.tag_number,
        monthly_depreciation
      ) RETURNING id INTO journal_entry_id;
      
      -- Create journal lines
      INSERT INTO journal_lines (
        journal_entry_id, account_code, account_name, description, 
        debit_amount, credit_amount, line_type, cow_id
      ) VALUES 
      (
        journal_entry_id, '6100', 'Depreciation Expense',
        'Monthly depreciation - Cow #' || cow_record.tag_number,
        monthly_depreciation, 0, 'debit', p_cow_id
      ),
      (
        journal_entry_id, '1500.1', 'Accumulated Depreciation - Dairy Cows',
        'Monthly depreciation - Cow #' || cow_record.tag_number,
        0, monthly_depreciation, 'credit', p_cow_id
      );
      
      entries_created := entries_created + 1;
    END IF;
    
    current_period := current_period + INTERVAL '1 month';
  END LOOP;
  
  RETURN jsonb_build_object(
    'success', true,
    'cow_id', p_cow_id,
    'entries_created', entries_created,
    'target_date', p_target_date
  );
END;
$function$;

-- Create enhanced disposition processing function that ensures depreciation catch-up
CREATE OR REPLACE FUNCTION public.process_disposition_journal_with_catchup(p_disposition_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
  disposition_record RECORD;
  cow_record RECORD;
  catchup_result JSONB;
  new_journal_entry_id UUID;
  actual_accumulated_depreciation NUMERIC := 0;
  gain_loss NUMERIC;
  actual_book_value NUMERIC;
BEGIN
  -- Get disposition details
  SELECT cd.id, cd.cow_id, cd.disposition_type, cd.disposition_date, cd.sale_amount, cd.final_book_value,
         cd.company_id, cd.journal_entry_id,
         c.tag_number, c.purchase_price, c.current_value, c.total_depreciation, c.salvage_value
  INTO disposition_record
  FROM cow_dispositions cd
  JOIN cows c ON c.id = cd.cow_id
  WHERE cd.id = p_disposition_id;
  
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Disposition not found');
  END IF;
  
  -- FIRST: Ensure all depreciation entries exist up to the disposition date
  SELECT catch_up_cow_depreciation_to_date(disposition_record.cow_id, disposition_record.disposition_date) 
  INTO catchup_result;
  
  IF NOT (catchup_result->>'success')::BOOLEAN THEN
    RETURN jsonb_build_object(
      'success', false, 
      'error', 'Failed to catch up depreciation: ' || (catchup_result->>'error')
    );
  END IF;
  
  -- NOW: Get ACTUAL accumulated depreciation from all journal entries up to disposition date
  SELECT COALESCE(SUM(jl.credit_amount), 0) INTO actual_accumulated_depreciation
  FROM journal_lines jl
  JOIN journal_entries je ON je.id = jl.journal_entry_id
  WHERE jl.cow_id = disposition_record.cow_id
    AND jl.account_code = '1500.1'
    AND jl.account_name = 'Accumulated Depreciation - Dairy Cows'
    AND jl.line_type = 'credit'
    AND je.entry_type = 'depreciation'
    AND je.entry_date <= disposition_record.disposition_date;
  
  -- Calculate actual book value and gain/loss
  actual_book_value := disposition_record.purchase_price - actual_accumulated_depreciation;
  gain_loss := COALESCE(disposition_record.sale_amount, 0) - actual_book_value;
  
  -- Delete existing journal entry if it exists
  IF disposition_record.journal_entry_id IS NOT NULL THEN
    DELETE FROM journal_lines WHERE journal_entry_id = disposition_record.journal_entry_id;
    DELETE FROM journal_entries WHERE id = disposition_record.journal_entry_id;
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
  
  -- Create journal lines
  
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
  UPDATE cow_dispositions 
  SET journal_entry_id = new_journal_entry_id
  WHERE id = p_disposition_id;
  
  RETURN jsonb_build_object(
    'success', true,
    'journal_entry_id', new_journal_entry_id,
    'total_amount', disposition_record.purchase_price,
    'actual_accumulated_depreciation', actual_accumulated_depreciation,
    'actual_book_value', actual_book_value,
    'gain_loss', gain_loss,
    'depreciation_entries_created', catchup_result->>'entries_created'
  );
  
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object(
    'success', false,
    'error', SQLERRM
  );
END;
$function$;

-- Update the trigger to use the new function with catch-up
CREATE OR REPLACE FUNCTION public.create_disposition_journal_trigger()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
BEGIN
  -- Only create journal if one doesn't already exist
  IF NEW.journal_entry_id IS NULL THEN
    PERFORM process_disposition_journal_with_catchup(NEW.id);
  END IF;
  
  RETURN NEW;
END;
$function$;