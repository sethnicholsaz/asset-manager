-- Create function to update cow depreciation values after catch-up processing
CREATE OR REPLACE FUNCTION public.update_cow_depreciation_values(p_cow_id text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  total_accumulated_depreciation NUMERIC := 0;
  cow_purchase_price NUMERIC;
BEGIN
  -- Get the cow's purchase price
  SELECT purchase_price INTO cow_purchase_price 
  FROM cows 
  WHERE id = p_cow_id;
  
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Cow not found');
  END IF;
  
  -- Calculate total accumulated depreciation from journal entries
  SELECT COALESCE(SUM(jl.credit_amount), 0) INTO total_accumulated_depreciation
  FROM journal_entries je
  JOIN journal_lines jl ON jl.journal_entry_id = je.id
  WHERE jl.cow_id = p_cow_id 
    AND je.entry_type = 'depreciation'
    AND jl.account_code = '1500.1';
  
  -- Update cow record
  UPDATE cows 
  SET total_depreciation = total_accumulated_depreciation,
      current_value = cow_purchase_price - total_accumulated_depreciation
  WHERE id = p_cow_id;
  
  RETURN jsonb_build_object(
    'success', true,
    'cow_id', p_cow_id,
    'total_depreciation', total_accumulated_depreciation,
    'current_value', cow_purchase_price - total_accumulated_depreciation
  );
END;
$function$;