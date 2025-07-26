-- Fix ALL monthly depreciation functions to exclude disposed cows

-- Update the main process_monthly_depreciation function
CREATE OR REPLACE FUNCTION public.process_monthly_depreciation(
  p_company_id uuid, 
  p_target_month integer, 
  p_target_year integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  cow_record RECORD;
  total_monthly_depreciation NUMERIC := 0;
  cows_processed_count INTEGER := 0;
  journal_entry_id UUID;
  target_date DATE;
  first_of_month DATE;
BEGIN
  -- Calculate target date (last day of target month)
  target_date := (p_target_year || '-' || p_target_month || '-01')::DATE + INTERVAL '1 month - 1 day';
  first_of_month := (p_target_year || '-' || p_target_month || '-01')::DATE;
  
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
  
  -- Process cows that should be depreciated in the target month
  -- CRITICAL FIX: Exclude cows disposed during the target month
  FOR cow_record IN 
    SELECT c.id, c.tag_number, c.purchase_price, c.salvage_value, c.freshen_date
    FROM public.cows c
    WHERE c.company_id = p_company_id 
      AND c.freshen_date <= target_date  -- Cow must have freshened by end of target month
      AND c.status = 'active'  -- Only active cows get monthly depreciation
      -- CRITICAL FIX: Exclude cows disposed during the target month
      AND NOT EXISTS (
        SELECT 1 FROM public.cow_dispositions cd 
        WHERE cd.cow_id = c.id 
        AND cd.disposition_date >= first_of_month 
        AND cd.disposition_date <= target_date
      )
  LOOP
    DECLARE
      monthly_depreciation NUMERIC;
    BEGIN
      -- Calculate monthly depreciation for this cow
      monthly_depreciation := public.calculate_cow_monthly_depreciation(
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
    
    -- Create individual journal lines for each eligible cow
    FOR cow_record IN 
      SELECT c.id, c.tag_number, c.purchase_price, c.salvage_value, c.freshen_date
      FROM public.cows c
      WHERE c.company_id = p_company_id 
        AND c.freshen_date <= target_date
        AND c.status = 'active'
        AND NOT EXISTS (
          SELECT 1 FROM public.cow_dispositions cd 
          WHERE cd.cow_id = c.id 
          AND cd.disposition_date >= first_of_month 
          AND cd.disposition_date <= target_date
        )
    LOOP
      DECLARE
        monthly_depreciation NUMERIC;
      BEGIN
        -- Calculate monthly depreciation for this cow
        monthly_depreciation := public.calculate_cow_monthly_depreciation(
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
            'Monthly depreciation - Cow #' || cow_record.tag_number || ' (' || TO_CHAR(target_date, 'Mon YYYY') || ')', 
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
            'Monthly depreciation - Cow #' || cow_record.tag_number || ' (' || TO_CHAR(target_date, 'Mon YYYY') || ')', 
            0, 
            monthly_depreciation, 
            'credit',
            cow_record.id
          );
        END IF;
      END;
    END LOOP;
  END IF;
  
  -- Return result
  RETURN jsonb_build_object(
    'success', true,
    'cows_processed', cows_processed_count,
    'total_amount', total_monthly_depreciation,
    'journal_entry_id', journal_entry_id
  );
  
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object(
    'success', false,
    'error', SQLERRM
  );
END;
$function$;

-- Also create a cleanup function to remove invalid depreciation entries
CREATE OR REPLACE FUNCTION public.cleanup_invalid_depreciation_entries(p_company_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  deleted_count INTEGER := 0;
BEGIN
  -- Delete depreciation journal lines for cows that were disposed before the depreciation date
  WITH invalid_entries AS (
    DELETE FROM public.journal_lines jl
    USING public.journal_entries je, public.cow_dispositions cd
    WHERE jl.journal_entry_id = je.id
      AND jl.cow_id = cd.cow_id
      AND je.company_id = p_company_id
      AND je.entry_type = 'depreciation'
      AND cd.disposition_date < je.entry_date
    RETURNING jl.journal_entry_id
  ),
  empty_entries AS (
    DELETE FROM public.journal_entries je
    WHERE je.id IN (
      SELECT DISTINCT journal_entry_id FROM invalid_entries
    )
    AND NOT EXISTS (
      SELECT 1 FROM public.journal_lines jl2 
      WHERE jl2.journal_entry_id = je.id
    )
    RETURNING 1
  )
  SELECT COUNT(*) INTO deleted_count FROM empty_entries;
  
  RETURN jsonb_build_object(
    'success', true,
    'deleted_entries', deleted_count
  );
  
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object(
    'success', false,
    'error', SQLERRM
  );
END;
$function$;