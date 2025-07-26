-- Update the reinstatement catch-up function to properly exclude disposed periods
CREATE OR REPLACE FUNCTION public.process_reinstatement_catchup_depreciation(
  p_cow_id text,
  p_disposition_date date,
  p_reinstatement_date date DEFAULT CURRENT_DATE
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  cow_record RECORD;
  current_month INTEGER;
  current_year INTEGER;
  total_catchup_amount NUMERIC := 0;
  monthly_depreciation_rate NUMERIC;
  journal_entry_id UUID;
  catchup_description TEXT;
  partial_may_amount NUMERIC := 0;
  partial_july_amount NUMERIC := 0;
  days_in_may INTEGER;
  days_in_july INTEGER;
  days_after_disposition INTEGER;
  days_until_reinstatement INTEGER;
BEGIN
  -- Get current posting period
  current_month := EXTRACT(MONTH FROM p_reinstatement_date);
  current_year := EXTRACT(YEAR FROM p_reinstatement_date);
  
  -- Get cow details
  SELECT c.id, c.tag_number, c.purchase_price, c.salvage_value, c.freshen_date, c.company_id
  INTO cow_record
  FROM public.cows c
  WHERE c.id = p_cow_id;
  
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Cow not found');
  END IF;
  
  -- Calculate monthly depreciation rate
  monthly_depreciation_rate := ROUND((cow_record.purchase_price - cow_record.salvage_value) / (5 * 12), 2);
  
  -- Calculate partial May depreciation (May 16-31) if disposition was mid-month
  IF EXTRACT(DAY FROM p_disposition_date) < EXTRACT(DAY FROM (DATE_TRUNC('month', p_disposition_date) + INTERVAL '1 month - 1 day')) THEN
    days_in_may := EXTRACT(DAY FROM (DATE_TRUNC('month', p_disposition_date) + INTERVAL '1 month - 1 day'));
    days_after_disposition := days_in_may - EXTRACT(DAY FROM p_disposition_date);
    partial_may_amount := ROUND(monthly_depreciation_rate * days_after_disposition / days_in_may, 2);
    total_catchup_amount := total_catchup_amount + partial_may_amount;
  END IF;
  
  -- Calculate partial July depreciation (July 1-26) if reinstatement is mid-month
  IF DATE_TRUNC('month', p_reinstatement_date) = DATE_TRUNC('month', CURRENT_DATE) THEN
    days_in_july := EXTRACT(DAY FROM (DATE_TRUNC('month', p_reinstatement_date) + INTERVAL '1 month - 1 day'));
    days_until_reinstatement := EXTRACT(DAY FROM p_reinstatement_date);
    partial_july_amount := ROUND(monthly_depreciation_rate * days_until_reinstatement / days_in_july, 2);
    total_catchup_amount := total_catchup_amount + partial_july_amount;
  END IF;
  
  -- Create catch-up journal entry if there's missing depreciation
  IF total_catchup_amount > 0 THEN
    -- Build description of catch-up periods  
    catchup_description := 'Reinstatement catch-up depreciation - Cow #' || cow_record.tag_number || 
                          ' (May 16-31: $' || partial_may_amount || 
                          ', Jul 1-26: $' || partial_july_amount || ')';
    
    -- Create journal entry
    INSERT INTO public.journal_entries (
      company_id, entry_date, month, year, entry_type, description, total_amount
    ) VALUES (
      cow_record.company_id,
      p_reinstatement_date,
      current_month,
      current_year,
      'depreciation',
      catchup_description,
      total_catchup_amount
    ) RETURNING id INTO journal_entry_id;
    
    -- Create debit line for depreciation expense
    INSERT INTO public.journal_lines (
      journal_entry_id, account_code, account_name, description, debit_amount, credit_amount, line_type, cow_id
    ) VALUES (
      journal_entry_id, 
      '6100', 
      'Depreciation Expense', 
      catchup_description, 
      total_catchup_amount, 
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
      catchup_description, 
      0, 
      total_catchup_amount, 
      'credit',
      p_cow_id
    );
    
    -- Update cow totals
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
      current_value = purchase_price - (
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
  END IF;
  
  RETURN jsonb_build_object(
    'success', true,
    'cow_id', p_cow_id,
    'partial_may_amount', partial_may_amount,
    'partial_july_amount', partial_july_amount,
    'total_catchup_amount', total_catchup_amount,
    'posted_to_period', current_month || '/' || current_year,
    'journal_entry_id', journal_entry_id,
    'disposition_date', p_disposition_date,
    'reinstatement_date', p_reinstatement_date
  );
  
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object(
    'success', false,
    'error', SQLERRM
  );
END;
$$;