-- Fix the journal entry date logic in catch_up_cow_depreciation_to_date
-- Standard monthly depreciation entries should always be at month-end
-- Only the very last entry (if it's a partial month due to disposition) should use the disposition date

CREATE OR REPLACE FUNCTION public.catch_up_cow_depreciation_to_date(p_cow_id text, p_end_date date)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  cow_record RECORD;
  depreciation_settings RECORD;
  monthly_depreciation NUMERIC;
  processing_date DATE;
  end_of_month DATE;
  current_journal_entry_id UUID;
  entries_created INTEGER := 0;
  depreciation_end_date DATE;
  effective_end_date DATE;
  is_last_month BOOLEAN;
BEGIN
  -- Get cow details
  SELECT 
    c.id, 
    c.tag_number, 
    c.purchase_price, 
    c.salvage_value, 
    c.freshen_date, 
    c.company_id
  INTO cow_record
  FROM public.cows c
  WHERE c.id = p_cow_id;
  
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Cow not found');
  END IF;

  -- Get depreciation settings for the company
  SELECT 
    ds.default_depreciation_years,
    ds.default_depreciation_method,
    ds.default_salvage_percentage,
    ds.round_to_nearest_dollar
  INTO depreciation_settings
  FROM public.depreciation_settings ds
  WHERE ds.company_id = cow_record.company_id;
  
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Depreciation settings not found for company');
  END IF;

  -- Calculate depreciation end date (freshen date + depreciation years)
  depreciation_end_date := cow_record.freshen_date + (depreciation_settings.default_depreciation_years || ' years')::INTERVAL;
  
  -- Use the earlier of disposition date or depreciation end date
  effective_end_date := LEAST(p_end_date, depreciation_end_date);
  
  -- Calculate monthly depreciation
  IF depreciation_settings.default_depreciation_method = 'straight-line' THEN
    monthly_depreciation := (cow_record.purchase_price - cow_record.salvage_value) / (depreciation_settings.default_depreciation_years * 12);
  ELSE
    -- Default to straight-line if method not recognized
    monthly_depreciation := (cow_record.purchase_price - cow_record.salvage_value) / (depreciation_settings.default_depreciation_years * 12);
  END IF;
  
  -- Round to nearest dollar if setting is enabled
  IF depreciation_settings.round_to_nearest_dollar THEN
    monthly_depreciation := ROUND(monthly_depreciation);
  END IF;
  
  -- Start from the month after freshen date
  processing_date := DATE_TRUNC('month', cow_record.freshen_date) + INTERVAL '1 month';
  
  -- Process each month up to the effective end date
  WHILE processing_date <= effective_end_date LOOP
    -- Check if this is the last month being processed
    is_last_month := (processing_date + INTERVAL '1 month') > effective_end_date;
    
    -- For the last month, check if we need a partial month entry
    IF is_last_month AND p_end_date < depreciation_end_date THEN
      -- This is a disposition before the depreciation period ends - use disposition date
      end_of_month := p_end_date;
    ELSE
      -- Standard monthly depreciation - use end of month
      end_of_month := (DATE_TRUNC('month', processing_date) + INTERVAL '1 month - 1 day')::date;
    END IF;
    
    -- Check if depreciation entry already exists for this month
    SELECT je.id INTO current_journal_entry_id 
    FROM public.journal_entries je
    WHERE je.company_id = cow_record.company_id 
      AND je.month = EXTRACT(MONTH FROM processing_date) 
      AND je.year = EXTRACT(YEAR FROM processing_date) 
      AND je.entry_type = 'depreciation';
    
    -- If no entry exists, create one
    IF current_journal_entry_id IS NULL AND monthly_depreciation > 0 THEN
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
      ) RETURNING id INTO current_journal_entry_id;
      
      entries_created := entries_created + 1;
    END IF;
    
    -- If we have a journal entry (existing or new), ensure this cow's lines exist
    IF current_journal_entry_id IS NOT NULL AND monthly_depreciation > 0 THEN
      -- Check if lines for this cow already exist
      IF NOT EXISTS (
        SELECT 1 FROM public.journal_lines jl
        WHERE jl.journal_entry_id = current_journal_entry_id AND jl.cow_id = p_cow_id
      ) THEN
        -- Create debit line for depreciation expense
        INSERT INTO public.journal_lines (
          journal_entry_id, account_code, account_name, description, debit_amount, credit_amount, line_type, cow_id
        ) VALUES (
          current_journal_entry_id, 
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
          current_journal_entry_id, 
          '1500.1', 
          'Accumulated Depreciation - Dairy Cows', 
          'Monthly depreciation - Cow #' || cow_record.tag_number || ' (' || TO_CHAR(end_of_month, 'Mon YYYY') || ')', 
          0, 
          monthly_depreciation, 
          'credit',
          p_cow_id
        );
        
        -- Update the journal entry total amount
        UPDATE public.journal_entries je
        SET total_amount = (
          SELECT COALESCE(SUM(jl2.debit_amount), 0) 
          FROM public.journal_lines jl2
          WHERE jl2.journal_entry_id = je.id
        )
        WHERE je.id = current_journal_entry_id;
      END IF;
    END IF;
    
    -- Move to next month
    processing_date := processing_date + INTERVAL '1 month';
  END LOOP;
  
  RETURN jsonb_build_object(
    'success', true,
    'entries_created', entries_created,
    'cow_id', p_cow_id,
    'depreciation_end_date', depreciation_end_date,
    'effective_end_date', effective_end_date,
    'months_processed', EXTRACT(MONTH FROM AGE(effective_end_date, cow_record.freshen_date)) + (EXTRACT(YEAR FROM AGE(effective_end_date, cow_record.freshen_date)) * 12)
  );
  
END;
$function$; 