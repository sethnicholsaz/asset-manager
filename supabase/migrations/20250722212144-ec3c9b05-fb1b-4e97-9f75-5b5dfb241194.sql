-- Fix depreciation calculation to stop at disposition date and create disposition journal entries

-- First, update the monthly depreciation function to properly handle disposition dates
CREATE OR REPLACE FUNCTION public.process_monthly_depreciation(p_company_id uuid, p_target_month integer, p_target_year integer)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  cow_record RECORD;
  total_monthly_depreciation NUMERIC := 0;
  cows_processed_count INTEGER := 0;
  journal_entry_id UUID;
  target_date DATE;
  processing_log_id UUID;
  result JSONB;
BEGIN
  -- Calculate target date (last day of target month)
  target_date := (p_target_year || '-' || p_target_month || '-01')::DATE + INTERVAL '1 month - 1 day';
  
  -- Create processing log entry
  INSERT INTO public.monthly_processing_log (
    company_id, processing_month, processing_year, entry_type, status, started_at
  ) VALUES (
    p_company_id, p_target_month, p_target_year, 'depreciation', 'processing', now()
  ) 
  ON CONFLICT (company_id, processing_month, processing_year, entry_type)
  DO UPDATE SET status = 'processing', started_at = now(), error_message = NULL
  RETURNING id INTO processing_log_id;
  
  -- Check if journal entry already exists
  SELECT id INTO journal_entry_id 
  FROM public.journal_entries 
  WHERE company_id = p_company_id 
    AND month = p_target_month 
    AND year = p_target_year 
    AND entry_type = 'depreciation';
  
  -- If entry exists, delete it and its lines to recreate
  IF journal_entry_id IS NOT NULL THEN
    DELETE FROM public.journal_lines WHERE journal_entry_id = journal_entry_id;
    DELETE FROM public.journal_entries WHERE id = journal_entry_id;
  END IF;
  
  -- First pass: calculate total depreciation
  FOR cow_record IN 
    SELECT c.id, c.tag_number, c.purchase_price, c.salvage_value, c.freshen_date,
           cd.disposition_date, cd.disposition_type
    FROM cows c
    LEFT JOIN cow_dispositions cd ON cd.cow_id = c.id AND cd.company_id = c.company_id
    WHERE c.company_id = p_company_id 
      AND c.freshen_date <= target_date
      AND (cd.disposition_date IS NULL OR cd.disposition_date > target_date)
  LOOP
    DECLARE
      monthly_depreciation NUMERIC;
    BEGIN
      -- Calculate monthly depreciation for this cow
      monthly_depreciation := calculate_cow_monthly_depreciation(
        cow_record.purchase_price,
        cow_record.salvage_value,
        cow_record.freshen_date,
        target_date
      );
      
      -- Add to total if there's depreciation
      IF monthly_depreciation > 0 THEN
        total_monthly_depreciation := total_monthly_depreciation + monthly_depreciation;
        cows_processed_count := cows_processed_count + 1;
      END IF;
    END;
  END LOOP;
  
  -- Create journal entry if there's depreciation to record
  IF total_monthly_depreciation > 0 THEN
    INSERT INTO public.journal_entries (
      company_id, entry_date, month, year, entry_type, description, total_amount
    ) VALUES (
      p_company_id,
      target_date,
      p_target_month,
      p_target_year,
      'depreciation',
      'Monthly Depreciation - ' || TO_CHAR(target_date, 'Month YYYY'),
      total_monthly_depreciation
    ) RETURNING id INTO journal_entry_id;
    
    -- Second pass: create individual journal lines for each cow
    FOR cow_record IN 
      SELECT c.id, c.tag_number, c.purchase_price, c.salvage_value, c.freshen_date,
             cd.disposition_date, cd.disposition_type
      FROM cows c
      LEFT JOIN cow_dispositions cd ON cd.cow_id = c.id AND cd.company_id = c.company_id
      WHERE c.company_id = p_company_id 
        AND c.freshen_date <= target_date
        AND (cd.disposition_date IS NULL OR cd.disposition_date > target_date)
    LOOP
      DECLARE
        monthly_depreciation NUMERIC;
      BEGIN
        -- Calculate monthly depreciation for this cow
        monthly_depreciation := calculate_cow_monthly_depreciation(
          cow_record.purchase_price,
          cow_record.salvage_value,
          cow_record.freshen_date,
          target_date
        );
        
        -- Create individual journal lines for this cow if there's depreciation
        IF monthly_depreciation > 0 THEN
          -- Debit line for depreciation expense
          INSERT INTO public.journal_lines (
            journal_entry_id, account_code, account_name, description, debit_amount, credit_amount, line_type, cow_id
          ) VALUES (
            journal_entry_id, 
            '6100', 
            'Depreciation Expense', 
            'Monthly depreciation - Cow #' || cow_record.tag_number, 
            monthly_depreciation, 
            0, 
            'debit',
            cow_record.id
          );
          
          -- Credit line for accumulated depreciation
          INSERT INTO public.journal_lines (
            journal_entry_id, account_code, account_name, description, debit_amount, credit_amount, line_type, cow_id
          ) VALUES (
            journal_entry_id, 
            '1500.1', 
            'Accumulated Depreciation - Dairy Cows', 
            'Monthly depreciation - Cow #' || cow_record.tag_number, 
            0, 
            monthly_depreciation, 
            'credit',
            cow_record.id
          );
        END IF;
      END;
    END LOOP;
  END IF;
  
  -- Update processing log
  UPDATE public.monthly_processing_log 
  SET status = 'completed', 
      cows_processed = cows_processed_count, 
      total_amount = total_monthly_depreciation,
      completed_at = now()
  WHERE id = processing_log_id;
  
  -- Return result
  result := jsonb_build_object(
    'success', true,
    'cows_processed', cows_processed_count,
    'total_amount', total_monthly_depreciation,
    'journal_entry_id', journal_entry_id
  );
  
  RETURN result;
  
EXCEPTION WHEN OTHERS THEN
  -- Update processing log with error
  UPDATE public.monthly_processing_log 
  SET status = 'failed', 
      error_message = SQLERRM,
      completed_at = now()
  WHERE id = processing_log_id;
  
  -- Return error result
  RETURN jsonb_build_object(
    'success', false,
    'error', SQLERRM
  );
END;
$$;

-- Create function to process disposition journal entries
CREATE OR REPLACE FUNCTION public.process_disposition_journal(p_disposition_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  disposition_record RECORD;
  cow_record RECORD;
  journal_entry_id UUID;
  accumulated_depreciation NUMERIC;
  gain_loss NUMERIC;
BEGIN
  -- Get disposition details
  SELECT cd.*, c.tag_number, c.purchase_price, c.current_value, c.total_depreciation, c.company_id
  INTO disposition_record
  FROM cow_dispositions cd
  JOIN cows c ON c.id = cd.cow_id
  WHERE cd.id = p_disposition_id;
  
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Disposition not found');
  END IF;
  
  -- Calculate accumulated depreciation at disposition date
  accumulated_depreciation := disposition_record.total_depreciation;
  
  -- Calculate gain/loss
  gain_loss := disposition_record.sale_amount - disposition_record.final_book_value;
  
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
  ) RETURNING id INTO journal_entry_id;
  
  -- Create journal lines
  
  -- 1. Remove accumulated depreciation (debit)
  IF accumulated_depreciation > 0 THEN
    INSERT INTO public.journal_lines (
      journal_entry_id, account_code, account_name, description, debit_amount, credit_amount, line_type, cow_id
    ) VALUES (
      journal_entry_id, 
      '1500.1', 
      'Accumulated Depreciation - Dairy Cows', 
      'Remove accumulated depreciation - Cow #' || disposition_record.tag_number, 
      accumulated_depreciation, 
      0, 
      'debit',
      disposition_record.cow_id
    );
  END IF;
  
  -- 2. Record cash received (if sale)
  IF disposition_record.disposition_type = 'sale' AND disposition_record.sale_amount > 0 THEN
    INSERT INTO public.journal_lines (
      journal_entry_id, account_code, account_name, description, debit_amount, credit_amount, line_type, cow_id
    ) VALUES (
      journal_entry_id, 
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
  IF gain_loss != 0 THEN
    IF gain_loss > 0 THEN
      -- Gain on disposal (credit)
      INSERT INTO public.journal_lines (
        journal_entry_id, account_code, account_name, description, debit_amount, credit_amount, line_type, cow_id
      ) VALUES (
        journal_entry_id, 
        '8000', 
        'Gain on Asset Disposal', 
        'Gain on disposal - Cow #' || disposition_record.tag_number, 
        0, 
        gain_loss, 
        'credit',
        disposition_record.cow_id
      );
    ELSE
      -- Loss on disposal (debit)
      INSERT INTO public.journal_lines (
        journal_entry_id, account_code, account_name, description, debit_amount, credit_amount, line_type, cow_id
      ) VALUES (
        journal_entry_id, 
        '7000', 
        'Loss on Asset Disposal', 
        'Loss on disposal - Cow #' || disposition_record.tag_number, 
        ABS(gain_loss), 
        0, 
        'debit',
        disposition_record.cow_id
      );
    END IF;
  END IF;
  
  -- 4. Remove original asset (credit)
  INSERT INTO public.journal_lines (
    journal_entry_id, account_code, account_name, description, debit_amount, credit_amount, line_type, cow_id
  ) VALUES (
    journal_entry_id, 
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
  SET journal_entry_id = journal_entry_id 
  WHERE id = p_disposition_id;
  
  RETURN jsonb_build_object(
    'success', true,
    'journal_entry_id', journal_entry_id,
    'total_amount', disposition_record.purchase_price,
    'gain_loss', gain_loss
  );
  
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object(
    'success', false,
    'error', SQLERRM
  );
END;
$$;

-- Create function to reverse journal entries (for reinstatement)
CREATE OR REPLACE FUNCTION public.reverse_journal_entry(p_journal_entry_id uuid, p_reason text DEFAULT 'Journal reversal')
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  original_entry RECORD;
  reversal_entry_id UUID;
  line_record RECORD;
BEGIN
  -- Get original journal entry
  SELECT * INTO original_entry
  FROM journal_entries
  WHERE id = p_journal_entry_id;
  
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Journal entry not found');
  END IF;
  
  -- Create reversal entry
  INSERT INTO public.journal_entries (
    company_id, entry_date, month, year, entry_type, description, total_amount
  ) VALUES (
    original_entry.company_id,
    CURRENT_DATE,
    EXTRACT(MONTH FROM CURRENT_DATE),
    EXTRACT(YEAR FROM CURRENT_DATE),
    original_entry.entry_type || '_reversal',
    'REVERSAL: ' || original_entry.description || ' - ' || p_reason,
    original_entry.total_amount
  ) RETURNING id INTO reversal_entry_id;
  
  -- Create reversed journal lines (swap debits and credits)
  FOR line_record IN 
    SELECT * FROM journal_lines WHERE journal_entry_id = p_journal_entry_id
  LOOP
    INSERT INTO public.journal_lines (
      journal_entry_id, account_code, account_name, description, 
      debit_amount, credit_amount, line_type, cow_id
    ) VALUES (
      reversal_entry_id,
      line_record.account_code,
      line_record.account_name,
      'REVERSAL: ' || line_record.description,
      line_record.credit_amount,  -- Swap credit to debit
      line_record.debit_amount,   -- Swap debit to credit
      CASE WHEN line_record.line_type = 'debit' THEN 'credit' ELSE 'debit' END,
      line_record.cow_id
    );
  END LOOP;
  
  RETURN jsonb_build_object(
    'success', true,
    'reversal_entry_id', reversal_entry_id,
    'original_entry_id', p_journal_entry_id
  );
  
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object(
    'success', false,
    'error', SQLERRM
  );
END;
$$;

-- Create trigger to automatically create disposition journal when a disposition is created
CREATE OR REPLACE FUNCTION public.create_disposition_journal_trigger()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  -- Only create journal if one doesn't already exist
  IF NEW.journal_entry_id IS NULL THEN
    PERFORM process_disposition_journal(NEW.id);
  END IF;
  
  RETURN NEW;
END;
$$;

-- Create the trigger
DROP TRIGGER IF EXISTS auto_create_disposition_journal ON cow_dispositions;
CREATE TRIGGER auto_create_disposition_journal
  AFTER INSERT ON cow_dispositions
  FOR EACH ROW
  EXECUTE FUNCTION create_disposition_journal_trigger();