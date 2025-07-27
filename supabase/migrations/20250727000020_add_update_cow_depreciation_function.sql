-- Add function to update cow total_depreciation field based on journal entries
-- This function calculates the total depreciation for each cow from journal entries and updates the cows table

CREATE OR REPLACE FUNCTION public.update_cow_depreciation_totals(p_company_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  cow_record RECORD;
  total_updated INTEGER := 0;
  total_processed INTEGER := 0;
BEGIN
  -- Update total_depreciation for each cow based on journal entries
  FOR cow_record IN 
    SELECT 
      c.id,
      c.tag_number,
      COALESCE(SUM(jl.credit_amount), 0) as calculated_depreciation
    FROM public.cows c
    LEFT JOIN public.journal_lines jl ON jl.cow_id = c.id 
      AND jl.account_code = '1500.1' 
      AND jl.line_type = 'credit'
    WHERE c.company_id = p_company_id
      AND c.freshen_date IS NOT NULL
    GROUP BY c.id, c.tag_number
  LOOP
    -- Update the cow's total_depreciation field
    UPDATE public.cows 
    SET total_depreciation = cow_record.calculated_depreciation
    WHERE id = cow_record.id;
    
    total_updated := total_updated + 1;
  END LOOP;
  
  -- Get total count of processed cows
  SELECT COUNT(*) INTO total_processed
  FROM public.cows 
  WHERE company_id = p_company_id 
    AND freshen_date IS NOT NULL;
  
  RETURN jsonb_build_object(
    'success', true,
    'cows_processed', total_processed,
    'cows_updated', total_updated,
    'message', 'Cow depreciation totals updated successfully'
  );
  
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object(
    'success', false,
    'error', SQLERRM,
    'message', 'Failed to update cow depreciation totals'
  );
END;
$function$; 