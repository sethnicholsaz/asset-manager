-- Create a comprehensive function to handle both scenarios:
-- 1. Adjust existing depreciation if monthly processing already ran
-- 2. Ensure correct calculation if processing hasn't run yet

CREATE OR REPLACE FUNCTION public.process_cow_depreciation_with_disposition_check(p_cow_id text, p_disposition_date date)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  cow_record RECORD;
  disposition_month INTEGER;
  disposition_year INTEGER;
  existing_entries_count INTEGER;
  monthly_depreciation NUMERIC;
  partial_depreciation NUMERIC;
  days_in_month INTEGER;
  days_until_disposition INTEGER;
  journal_entry_id UUID;
  result JSONB;
BEGIN
  -- Get cow details
  SELECT c.id, c.tag_number, c.purchase_price, c.salvage_value, c.freshen_date, c.company_id
  INTO cow_record
  FROM public.cows c
  WHERE c.id = p_cow_id;
  
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Cow not found');
  END IF;
  
  -- Extract disposition month and year
  disposition_month := EXTRACT(MONTH FROM p_disposition_date);
  disposition_year := EXTRACT(YEAR FROM p_disposition_date);
  
  -- Calculate monthly depreciation rate
  monthly_depreciation := ROUND((cow_record.purchase_price - cow_record.salvage_value) / (5 * 12), 2);
  
  -- Check if monthly depreciation entries already exist for the disposition month
  SELECT COUNT(*)
  INTO existing_entries_count
  FROM public.journal_lines jl
  JOIN public.journal_entries je ON je.id = jl.journal_entry_id
  WHERE jl.cow_id = p_cow_id
    AND je.month = disposition_month
    AND je.year = disposition_year
    AND je.entry_type = 'depreciation';
  
  -- SCENARIO 1: Monthly processing already ran - need to adjust existing entries
  IF existing_entries_count > 0 THEN
    -- Remove invalid full-month depreciation entries for the disposition month
    DELETE FROM public.journal_lines 
    WHERE journal_entry_id IN (
      SELECT je.id 
      FROM public.journal_entries je
      WHERE je.entry_type = 'depreciation'
        AND je.month = disposition_month
        AND je.year = disposition_year
        AND je.entry_date > p_disposition_date
        AND je.company_id = cow_record.company_id
    ) AND cow_id = p_cow_id;
    
    -- Remove empty journal entries
    DELETE FROM public.journal_entries 
    WHERE entry_type = 'depreciation'
      AND month = disposition_month
      AND year = disposition_year
      AND company_id = cow_record.company_id
      AND entry_date > p_disposition_date
      AND NOT EXISTS (
        SELECT 1 FROM public.journal_lines jl 
        WHERE jl.journal_entry_id = journal_entries.id
      );
    
    -- Calculate partial month depreciation if disposition occurred mid-month
    IF EXTRACT(DAY FROM p_disposition_date) > 1 THEN
      days_in_month := EXTRACT(DAY FROM (DATE_TRUNC('month', p_disposition_date) + INTERVAL '1 month - 1 day'));
      days_until_disposition := EXTRACT(DAY FROM p_disposition_date);
      partial_depreciation := ROUND(monthly_depreciation * days_until_disposition / days_in_month, 2);
      
      -- Create partial month depreciation entry
      INSERT INTO public.journal_entries (
        company_id, entry_date, month, year, entry_type, description, total_amount
      ) VALUES (
        cow_record.company_id,
        p_disposition_date,
        disposition_month,
        disposition_year,
        'depreciation',
        'Partial month depreciation - Cow #' || cow_record.tag_number || ' (through ' || p_disposition_date || ')',
        partial_depreciation
      ) RETURNING id INTO journal_entry_id;
      
      -- Create journal lines for partial depreciation
      INSERT INTO public.journal_lines (
        journal_entry_id, account_code, account_name, description, debit_amount, credit_amount, line_type, cow_id
      ) VALUES (
        journal_entry_id, 
        '6100', 
        'Depreciation Expense', 
        'Partial month depreciation - Cow #' || cow_record.tag_number || ' (' || days_until_disposition || ' days)', 
        partial_depreciation, 
        0, 
        'debit',
        p_cow_id
      );
      
      INSERT INTO public.journal_lines (
        journal_entry_id, account_code, account_name, description, debit_amount, credit_amount, line_type, cow_id
      ) VALUES (
        journal_entry_id, 
        '1500.1', 
        'Accumulated Depreciation - Dairy Cows', 
        'Partial month depreciation - Cow #' || cow_record.tag_number || ' (' || days_until_disposition || ' days)', 
        0, 
        partial_depreciation, 
        'credit',
        p_cow_id
      );
    END IF;
    
    result := jsonb_build_object(
      'success', true,
      'scenario', 'adjusted_existing',
      'message', 'Adjusted existing depreciation entries',
      'partial_depreciation', COALESCE(partial_depreciation, 0),
      'removed_entries', existing_entries_count
    );
    
  -- SCENARIO 2: Monthly processing hasn't run - ensure correct historical calculation
  ELSE
    -- This scenario is handled by the updated monthly processing function
    -- which now properly excludes disposed cows
    result := jsonb_build_object(
      'success', true,
      'scenario', 'historical_setup',
      'message', 'No existing entries found. Monthly processing will calculate correctly.',
      'monthly_depreciation_rate', monthly_depreciation
    );
  END IF;
  
  -- Update cow totals to reflect actual depreciation
  UPDATE public.cows
  SET 
    total_depreciation = (
      SELECT COALESCE(SUM(jl.credit_amount), 0)
      FROM public.journal_lines jl
      JOIN public.journal_entries je ON je.id = jl.journal_entry_id
      WHERE jl.cow_id = p_cow_id
        AND jl.account_code = '1500.1'
        AND jl.line_type = 'credit'
        AND je.entry_type = 'depreciation'
    ),
    updated_at = now()
  WHERE id = p_cow_id;
  
  RETURN result;
  
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object(
    'success', false,
    'error', SQLERRM
  );
END;
$function$;

-- Create a function to check and process all disposed cows for a company
CREATE OR REPLACE FUNCTION public.validate_all_cow_depreciation_for_company(p_company_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  cow_record RECORD;
  total_processed INTEGER := 0;
  total_adjusted INTEGER := 0;
  processing_results JSONB := '[]';
  cow_result JSONB;
BEGIN
  -- Process all disposed cows for the company
  FOR cow_record IN 
    SELECT c.id, c.tag_number, cd.disposition_date
    FROM public.cows c
    JOIN public.cow_dispositions cd ON cd.cow_id = c.id
    WHERE c.company_id = p_company_id
    ORDER BY cd.disposition_date
  LOOP
    total_processed := total_processed + 1;
    
    -- Process each cow's depreciation
    SELECT public.process_cow_depreciation_with_disposition_check(
      cow_record.id, 
      cow_record.disposition_date
    ) INTO cow_result;
    
    -- Track adjustments
    IF (cow_result->>'scenario') = 'adjusted_existing' THEN
      total_adjusted := total_adjusted + 1;
    END IF;
    
    -- Add to results
    processing_results := processing_results || jsonb_build_array(
      jsonb_build_object(
        'cow_id', cow_record.id,
        'tag_number', cow_record.tag_number,
        'disposition_date', cow_record.disposition_date,
        'result', cow_result
      )
    );
  END LOOP;
  
  RETURN jsonb_build_object(
    'success', true,
    'company_id', p_company_id,
    'total_processed', total_processed,
    'total_adjusted', total_adjusted,
    'details', processing_results
  );
  
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object(
    'success', false,
    'error', SQLERRM
  );
END;
$function$;