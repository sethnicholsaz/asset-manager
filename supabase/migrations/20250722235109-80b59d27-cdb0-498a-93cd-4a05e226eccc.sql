-- Update the acquisition journal function to handle both purchased and raised cows
CREATE OR REPLACE FUNCTION public.process_acquisition_journal(p_cow_id text, p_company_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  cow_record RECORD;
  journal_entry_id UUID;
BEGIN
  -- Get cow details
  SELECT c.tag_number, c.purchase_price, c.acquisition_type, c.freshen_date
  INTO cow_record
  FROM cows c
  WHERE c.id = p_cow_id AND c.company_id = p_company_id;
  
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Cow not found');
  END IF;
  
  -- Create journal entry for acquisition
  INSERT INTO public.journal_entries (
    company_id, entry_date, month, year, entry_type, description, total_amount
  ) VALUES (
    p_company_id,
    cow_record.freshen_date,
    EXTRACT(MONTH FROM cow_record.freshen_date),
    EXTRACT(YEAR FROM cow_record.freshen_date),
    'acquisition',
    'Asset Acquisition - Cow #' || cow_record.tag_number || ' (' || cow_record.acquisition_type || ')',
    cow_record.purchase_price
  ) RETURNING id INTO journal_entry_id;
  
  -- Create journal lines for acquisition
  
  -- Debit line for dairy cow asset (always the same)
  INSERT INTO public.journal_lines (
    journal_entry_id, account_code, account_name, description, debit_amount, credit_amount, line_type, cow_id
  ) VALUES (
    journal_entry_id, 
    '1500', 
    'Dairy Cows', 
    'Acquire cow asset - Cow #' || cow_record.tag_number, 
    cow_record.purchase_price, 
    0, 
    'debit',
    p_cow_id
  );
  
  -- Credit line depends on acquisition type
  IF cow_record.acquisition_type = 'purchased' THEN
    -- Credit cash for purchased cows
    INSERT INTO public.journal_lines (
      journal_entry_id, account_code, account_name, description, debit_amount, credit_amount, line_type, cow_id
    ) VALUES (
      journal_entry_id, 
      '1000', 
      'Cash', 
      'Payment for cow acquisition - Cow #' || cow_record.tag_number, 
      0, 
      cow_record.purchase_price, 
      'credit',
      p_cow_id
    );
  ELSE
    -- Credit heifer asset for raised cows
    INSERT INTO public.journal_lines (
      journal_entry_id, account_code, account_name, description, debit_amount, credit_amount, line_type, cow_id
    ) VALUES (
      journal_entry_id, 
      '1400', 
      'Heifers', 
      'Transfer from heifer to dairy cow - Cow #' || cow_record.tag_number, 
      0, 
      cow_record.purchase_price, 
      'credit',
      p_cow_id
    );
  END IF;
  
  RETURN jsonb_build_object(
    'success', true,
    'journal_entry_id', journal_entry_id,
    'total_amount', cow_record.purchase_price,
    'acquisition_type', cow_record.acquisition_type
  );
  
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object(
    'success', false,
    'error', SQLERRM
  );
END;
$$;