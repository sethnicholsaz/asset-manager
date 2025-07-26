-- Fix disposition processing to only remove accumulated depreciation up to disposition date
-- Replace the existing process_disposition_journal function

CREATE OR REPLACE FUNCTION public.process_disposition_journal(p_disposition_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  disposition_record RECORD;
  cow_record RECORD;
  new_journal_entry_id UUID;
  actual_accumulated_depreciation NUMERIC := 0;
  calculated_book_value NUMERIC;
  gain_loss NUMERIC;
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
  
  -- Get ACTUAL accumulated depreciation from journal entries UP TO disposition date only
  SELECT COALESCE(SUM(jl.credit_amount), 0) INTO actual_accumulated_depreciation
  FROM journal_lines jl
  JOIN journal_entries je ON je.id = jl.journal_entry_id
  WHERE jl.cow_id = disposition_record.cow_id
    AND jl.account_code = '1500.1'
    AND jl.account_name = 'Accumulated Depreciation - Dairy Cows'
    AND jl.line_type = 'credit'
    AND je.entry_type = 'depreciation'
    AND je.entry_date <= disposition_record.disposition_date;
  
  -- Calculate the actual book value based on recorded depreciation
  calculated_book_value := disposition_record.purchase_price - actual_accumulated_depreciation;
  
  -- Calculate gain/loss based on actual book value
  gain_loss := COALESCE(disposition_record.sale_amount, 0) - calculated_book_value;
  
  -- Delete existing journal entry if it exists
  IF disposition_record.journal_entry_id IS NOT NULL THEN
    DELETE FROM journal_lines WHERE journal_entry_id = disposition_record.journal_entry_id;
    DELETE FROM journal_entries WHERE id = disposition_record.journal_entry_id;
  END IF;
  
  -- Create journal entry for disposition
  INSERT INTO journal_entries (
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
  
  -- 1. Remove ONLY actual accumulated depreciation (debit) - not calculated amount
  IF actual_accumulated_depreciation > 0 THEN
    INSERT INTO journal_lines (
      journal_entry_id, account_code, account_name, description, debit_amount, credit_amount, line_type, cow_id
    ) VALUES (
      new_journal_entry_id, 
      '1500.1', 
      'Accumulated Depreciation - Dairy Cows', 
      'Remove actual accumulated depreciation - Cow #' || disposition_record.tag_number || ' ($' || actual_accumulated_depreciation || ')', 
      actual_accumulated_depreciation, 
      0, 
      'debit',
      disposition_record.cow_id
    );
  END IF;
  
  -- 2. Record cash received (if sale and sale amount > 0)
  IF disposition_record.disposition_type = 'sale' AND COALESCE(disposition_record.sale_amount, 0) > 0 THEN
    INSERT INTO journal_lines (
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
  
  -- 3. Record gain or loss based on actual book value
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
      
      INSERT INTO journal_lines (
        journal_entry_id, account_code, account_name, description, debit_amount, credit_amount, line_type, cow_id
      ) VALUES (
        new_journal_entry_id, 
        account_code, 
        account_name, 
        CASE WHEN gain_loss > 0 THEN 'Gain' ELSE 'Loss' END || ' on ' || disposition_record.disposition_type || ' - Cow #' || disposition_record.tag_number || ' (Actual book value: $' || calculated_book_value || ')', 
        CASE WHEN gain_loss > 0 THEN 0 ELSE ABS(gain_loss) END, 
        CASE WHEN gain_loss > 0 THEN ABS(gain_loss) ELSE 0 END, 
        CASE WHEN gain_loss > 0 THEN 'credit' ELSE 'debit' END,
        disposition_record.cow_id
      );
    END;
  END IF;
  
  -- 4. Remove original asset (credit)
  INSERT INTO journal_lines (
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
  
  -- Update disposition with journal entry ID and corrected book value
  UPDATE cow_dispositions 
  SET journal_entry_id = new_journal_entry_id,
      final_book_value = calculated_book_value,
      gain_loss = gain_loss
  WHERE id = p_disposition_id;
  
  RETURN jsonb_build_object(
    'success', true,
    'journal_entry_id', new_journal_entry_id,
    'total_amount', disposition_record.purchase_price,
    'actual_accumulated_depreciation', actual_accumulated_depreciation,
    'calculated_book_value', calculated_book_value,
    'gain_loss', gain_loss
  );
  
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object(
    'success', false,
    'error', SQLERRM
  );
END;
$function$;