-- Create disposition records for existing sold and deceased cows
INSERT INTO cow_dispositions (
  cow_id,
  company_id, 
  disposition_date,
  disposition_type,
  sale_amount,
  final_book_value,
  gain_loss,
  notes,
  created_at,
  updated_at
)
SELECT 
  c.tag_number as cow_id,
  c.company_id,
  c.freshen_date as disposition_date,
  CASE 
    WHEN c.status = 'sold' THEN 'sale'
    WHEN c.status = 'deceased' THEN 'death'
  END as disposition_type,
  CASE 
    WHEN c.status = 'sold' THEN c.purchase_price * 0.8
    ELSE 0
  END as sale_amount,
  c.current_value as final_book_value,
  CASE 
    WHEN c.status = 'sold' THEN (c.purchase_price * 0.8) - c.current_value
    ELSE -c.current_value
  END as gain_loss,
  'Created from imported ' || c.status || ' cow data' as notes,
  now() as created_at,
  now() as updated_at
FROM cows c
WHERE c.status IN ('sold', 'deceased')
AND NOT EXISTS (
  SELECT 1 FROM cow_dispositions cd 
  WHERE cd.cow_id = c.tag_number 
  AND cd.company_id = c.company_id
);