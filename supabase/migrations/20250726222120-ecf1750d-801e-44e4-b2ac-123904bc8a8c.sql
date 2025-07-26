CREATE OR REPLACE FUNCTION public.catch_up_cow_depreciation_to_date(p_cow_id text, p_end_date date)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  cow_record RECORD;
  processing_date DATE;
  end_of_month DATE;
  monthly_depreciation NUMERIC;
  journal_entry_id UUID;
  entries_created INTEGER := 0;
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
  monthly_depreciation := ROUND((cow_record.purchase_price - cow_record.salvage_value) / (5 * 12), 2);
  
  -- Start from the month after freshen date
  processing_date := DATE_TRUNC('month', cow_record.freshen_date) + INTERVAL '1 month';
  
  -- Process each month up to the end date
  WHILE processing_date <= p_end_date LOOP
    end_of_month := (DATE_TRUNC('month', processing_date) + INTERVAL '1 month - 1 day')::date;
    
    -- Check if depreciation entry already exists for this month
    SELECT je.id INTO journal_entry_id 
    FROM public.journal_entries je
    WHERE je.company_id = cow_record.company_id 
      AND je.month = EXTRACT(MONTH FROM processing_date) 
      AND je.year = EXTRACT(YEAR FROM processing_date) 
      AND je.entry_type = 'depreciation';
    
    -- If no entry exists, create one
    IF journal_entry_id IS NULL AND monthly_depreciation > 0 THEN
      INSERT INTO public.journal_entries (
        company_id, entry_date, month, year, entry_type, description, total_amount
      ) VALUES (
        cow_record.company_id,
        end_of_month,
        EXTRACT(MONTH FROM processing_date),
        EXTRACT(YEAR FROM processing_date),
        'depreciation',
        'Monthly Depreciation - ' || TO_CHAR(end_of_month, 'Month YYYY'),
        monthly_depreciation
      ) RETURNING id INTO journal_entry_id;
      
      entries_created := entries_created + 1;
    END IF;
    
    -- If we have a journal entry (existing or new), ensure this cow's lines exist
    IF journal_entry_id IS NOT NULL AND monthly_depreciation > 0 THEN
      -- Check if lines for this cow already exist
      IF NOT EXISTS (
        SELECT 1 FROM public.journal_lines jl
        WHERE jl.journal_entry_id = journal_entry_id AND jl.cow_id = p_cow_id
      ) THEN
        -- Create debit line for depreciation expense
        INSERT INTO public.journal_lines (
          journal_entry_id, account_code, account_name, description, debit_amount, credit_amount, line_type, cow_id
        ) VALUES (
          journal_entry_id, 
          '6100', 
          'Depreciation Expense', 
          'Monthly depreciation - Cow #' || cow_record.tag_number || ' (' || TO_CHAR(end_of_month, 'Mon YYYY') || ')', 
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
          'Monthly depreciation - Cow #' || cow_record.tag_number || ' (' || TO_CHAR(end_of_month, 'Mon YYYY') || ')', 
          0, 
          monthly_depreciation, 
          'credit',
          p_cow_id
        );
        
        -- Update the journal entry total amount (fixed variable reference)
        UPDATE public.journal_entries 
        SET total_amount = (
          SELECT COALESCE(SUM(jl2.debit_amount), 0) 
          FROM public.journal_lines jl2
          WHERE jl2.journal_entry_id = journal_entries.id
        )
        WHERE journal_entries.id = journal_entry_id;
      END IF;
    END IF;
    
    -- Move to next month
    processing_date := processing_date + INTERVAL '1 month';
  END LOOP;
  
  RETURN jsonb_build_object(
    'success', true,
    'entries_created', entries_created,
    'cow_id', p_cow_id
  );
  
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object(
    'success', false,
    'error', SQLERRM
  );
END;
$function$