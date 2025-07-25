-- Critical Security Fixes Phase 1: Database Security

-- 1. Enable RLS on system_logs table (currently missing RLS)
ALTER TABLE public.system_logs ENABLE ROW LEVEL SECURITY;

-- Create RLS policy for system_logs (only allow service role access)
CREATE POLICY "Service role only access to system logs" 
ON public.system_logs 
FOR ALL 
USING (false) -- Regular users cannot access
WITH CHECK (false); -- Regular users cannot insert

-- 2. Fix search_path security vulnerability in all functions
-- This prevents privilege escalation through search_path manipulation

-- Update persist_journal_batch function
CREATE OR REPLACE FUNCTION public.persist_journal_batch(journal_entries jsonb, journal_lines jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = ''
AS $function$
DECLARE
  entry_record jsonb;
  line_record jsonb;
  journal_id uuid;
  temp_id_mapping jsonb := '{}';
  created_entries int := 0;
  created_lines int := 0;
BEGIN
  -- Create journal entries
  FOR entry_record IN SELECT * FROM jsonb_array_elements(journal_entries)
  LOOP
    INSERT INTO public.journal_entries (
      company_id, 
      entry_date, 
      month, 
      year, 
      entry_type, 
      description, 
      total_amount, 
      status
    ) VALUES (
      (entry_record->>'company_id')::uuid,
      (entry_record->>'entry_date')::timestamptz,
      (entry_record->>'month')::int,
      (entry_record->>'year')::int,
      (entry_record->>'entry_type')::text,
      (entry_record->>'description')::text,
      (entry_record->>'total_amount')::decimal,
      (entry_record->>'status')::text
    ) 
    ON CONFLICT (company_id, month, year, entry_type) 
    DO UPDATE SET 
      total_amount = EXCLUDED.total_amount,
      description = EXCLUDED.description,
      entry_date = EXCLUDED.entry_date
    RETURNING id INTO journal_id;
    
    -- Map temporary ID to real journal ID
    temp_id_mapping := temp_id_mapping || jsonb_build_object(
      entry_record->>'description', 
      journal_id
    );
    
    created_entries := created_entries + 1;
  END LOOP;

  -- Create journal lines
  FOR line_record IN SELECT * FROM jsonb_array_elements(journal_lines)
  LOOP
    -- Get the real journal ID from our mapping
    journal_id := (temp_id_mapping->>line_record->>'journal_entry_temp_id')::uuid;
    
    IF journal_id IS NOT NULL THEN
      INSERT INTO public.journal_lines (
        journal_entry_id,
        cow_id,
        account_code,
        account_name,
        description,
        debit_amount,
        credit_amount,
        line_type
      ) VALUES (
        journal_id,
        CASE 
          WHEN line_record->>'cow_id' != 'null' AND line_record->>'cow_id' != '' 
          THEN (line_record->>'cow_id')::text 
          ELSE NULL 
        END,
        line_record->>'account_code',
        line_record->>'account_name',
        line_record->>'description',
        (line_record->>'debit_amount')::decimal,
        (line_record->>'credit_amount')::decimal,
        line_record->>'line_type'
      );
      
      created_lines := created_lines + 1;
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'journal_entries_created', created_entries,
    'journal_lines_created', created_lines,
    'success', true
  );

EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object(
    'success', false,
    'error', SQLERRM,
    'error_code', SQLSTATE
  );
END;
$function$;

-- Update cleanup_incomplete_journals function
CREATE OR REPLACE FUNCTION public.cleanup_incomplete_journals(company_id uuid, cutoff_time timestamp with time zone)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = ''
AS $function$
BEGIN
  -- Delete journal entries that have no lines and are older than cutoff
  DELETE FROM public.journal_entries je
  WHERE je.company_id = cleanup_incomplete_journals.company_id
    AND je.created_at < cutoff_time
    AND NOT EXISTS (
      SELECT 1 FROM public.journal_lines jl 
      WHERE jl.journal_entry_id = je.id
    );
    
  -- Log cleanup action
  INSERT INTO public.system_logs (level, message, data)
  VALUES (
    'INFO',
    'Cleaned up incomplete journals',
    jsonb_build_object(
      'company_id', company_id,
      'cutoff_time', cutoff_time,
      'deleted_count', ROW_COUNT
    )
  );
END;
$function$;

-- Update all remaining functions with search_path protection
CREATE OR REPLACE FUNCTION public.process_disposition_journal_corrected(p_disposition_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = ''
AS $function$
DECLARE
  disposition_record RECORD;
  cow_record RECORD;
  new_journal_entry_id UUID;
  actual_accumulated_depreciation NUMERIC := 0;
  gain_loss NUMERIC;
BEGIN
  -- Get disposition details
  SELECT cd.id, cd.cow_id, cd.disposition_type, cd.disposition_date, cd.sale_amount, cd.final_book_value,
         cd.company_id, cd.journal_entry_id,
         c.tag_number, c.purchase_price, c.current_value, c.total_depreciation, c.salvage_value
  INTO disposition_record
  FROM public.cow_dispositions cd
  JOIN public.cows c ON c.id = cd.cow_id
  WHERE cd.id = p_disposition_id;
  
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Disposition not found');
  END IF;
  
  -- Get ACTUAL accumulated depreciation from monthly depreciation journal entries
  SELECT COALESCE(SUM(jl.credit_amount), 0) INTO actual_accumulated_depreciation
  FROM public.journal_lines jl
  JOIN public.journal_entries je ON je.id = jl.journal_entry_id
  WHERE jl.cow_id = disposition_record.cow_id
    AND jl.account_code = '1500.1'
    AND jl.account_name = 'Accumulated Depreciation - Dairy Cows'
    AND jl.line_type = 'credit'
    AND je.entry_type = 'depreciation'
    AND je.entry_date < disposition_record.disposition_date;
  
  -- Calculate gain/loss based on actual accumulated depreciation
  DECLARE
    actual_book_value NUMERIC := disposition_record.purchase_price - actual_accumulated_depreciation;
  BEGIN
    gain_loss := COALESCE(disposition_record.sale_amount, 0) - actual_book_value;
  END;
  
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
  
  -- Create journal lines
  
  -- 1. Remove ACTUAL accumulated depreciation (debit) - only if there is any
  IF actual_accumulated_depreciation > 0 THEN
    INSERT INTO public.journal_lines (
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
        CASE WHEN gain_loss > 0 THEN 'Gain' ELSE 'Loss' END || ' on ' || disposition_record.disposition_type || ' - Cow #' || disposition_record.tag_number || ' (Actual book value: $' || (disposition_record.purchase_price - actual_accumulated_depreciation) || ')', 
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
  SET journal_entry_id = new_journal_entry_id
  WHERE id = p_disposition_id;
  
  RETURN jsonb_build_object(
    'success', true,
    'journal_entry_id', new_journal_entry_id,
    'total_amount', disposition_record.purchase_price,
    'actual_accumulated_depreciation', actual_accumulated_depreciation,
    'gain_loss', gain_loss
  );
  
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object(
    'success', false,
    'error', SQLERRM
  );
END;
$function$;

-- Add security audit log
INSERT INTO public.system_logs (level, message, data)
VALUES (
  'INFO',
  'Security fixes applied - Phase 1',
  jsonb_build_object(
    'fixes_applied', ARRAY[
      'Enabled RLS on system_logs table',
      'Added search_path protection to functions',
      'Updated function security models'
    ],
    'timestamp', now()
  )
);