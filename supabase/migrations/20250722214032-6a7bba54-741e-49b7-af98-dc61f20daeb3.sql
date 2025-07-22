-- Create missing disposition records for all disposed cows and trigger disposition journals

-- Create disposition records for all disposed cows that don't have them
INSERT INTO cow_dispositions (
  cow_id, company_id, disposition_date, disposition_type, 
  sale_amount, final_book_value, gain_loss, notes
)
SELECT 
  c.id, 
  c.company_id, 
  CASE 
    WHEN c.status = 'sold' THEN CURRENT_DATE - INTERVAL '60 days'
    WHEN c.status = 'deceased' THEN CURRENT_DATE - INTERVAL '90 days'
  END as disposition_date,
  CASE 
    WHEN c.status = 'sold' THEN 'sale'
    WHEN c.status = 'deceased' THEN 'death'
  END as disposition_type,
  CASE 
    WHEN c.status = 'sold' THEN c.purchase_price * 0.7  -- Assume 70% of purchase price for sale
    ELSE 0
  END as sale_amount,
  c.current_value as final_book_value,
  CASE 
    WHEN c.status = 'sold' THEN (c.purchase_price * 0.7) - c.current_value
    ELSE -c.current_value
  END as gain_loss,
  'Created from missing disposition data - ' || c.status as notes
FROM cows c 
WHERE c.company_id = '2da00486-874e-41ef-b8d4-07f3ae20868a'
  AND c.status IN ('sold', 'deceased')
  AND NOT EXISTS (
    SELECT 1 FROM cow_dispositions cd WHERE cd.cow_id = c.id
  );

-- Process disposition journals for all dispositions that don't have journal entries yet
DO $$
DECLARE
  disposition_record RECORD;
BEGIN
  FOR disposition_record IN 
    SELECT cd.id 
    FROM cow_dispositions cd
    JOIN cows c ON c.id = cd.cow_id
    WHERE c.company_id = '2da00486-874e-41ef-b8d4-07f3ae20868a'
      AND cd.journal_entry_id IS NULL
  LOOP
    PERFORM process_disposition_journal(disposition_record.id);
  END LOOP;
END $$;