-- Create function to get aggregated cow statistics efficiently
CREATE OR REPLACE FUNCTION public.get_active_cow_stats(p_company_id UUID)
RETURNS TABLE(
  count BIGINT,
  total_purchase_price NUMERIC,
  total_current_value NUMERIC,
  total_depreciation NUMERIC
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    COUNT(*) as count,
    COALESCE(SUM(purchase_price), 0) as total_purchase_price,
    COALESCE(SUM(current_value), 0) as total_current_value,
    COALESCE(SUM(total_depreciation), 0) as total_depreciation
  FROM cows
  WHERE company_id = p_company_id 
    AND status = 'active';
END;
$$;