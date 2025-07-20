-- Create function for global cow search
CREATE OR REPLACE FUNCTION public.search_cows(
  p_company_id UUID,
  p_search_query TEXT,
  p_limit INTEGER DEFAULT 1000,
  p_offset INTEGER DEFAULT 0
)
RETURNS TABLE(
  id TEXT,
  tag_number TEXT,
  name TEXT,
  birth_date DATE,
  freshen_date DATE,
  purchase_price NUMERIC,
  current_value NUMERIC,
  salvage_value NUMERIC,
  status TEXT,
  acquisition_type TEXT,
  depreciation_method TEXT,
  asset_type_id TEXT,
  total_depreciation NUMERIC,
  company_id UUID,
  disposition_id UUID,
  created_at TIMESTAMP WITH TIME ZONE,
  updated_at TIMESTAMP WITH TIME ZONE
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
BEGIN
  RETURN QUERY
  SELECT 
    c.id,
    c.tag_number,
    c.name,
    c.birth_date,
    c.freshen_date,
    c.purchase_price,
    c.current_value,
    c.salvage_value,
    c.status,
    c.acquisition_type,
    c.depreciation_method,
    c.asset_type_id,
    c.total_depreciation,
    c.company_id,
    c.disposition_id,
    c.created_at,
    c.updated_at
  FROM cows c
  WHERE c.company_id = p_company_id
    AND (
      p_search_query = '' OR
      c.tag_number ILIKE '%' || p_search_query || '%' OR
      c.name ILIKE '%' || p_search_query || '%' OR
      c.status ILIKE '%' || p_search_query || '%' OR
      c.acquisition_type ILIKE '%' || p_search_query || '%'
    )
  ORDER BY c.tag_number
  LIMIT p_limit
  OFFSET p_offset;
END;
$function$;