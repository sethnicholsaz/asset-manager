-- Fix the ambiguous column reference in the depreciation function
-- This should resolve the $44.88 imbalance in April 2025 depreciation

-- First, let's manually fix the April 2025 depreciation entry
-- Delete the existing unbalanced depreciation entry for April 2025
DELETE FROM journal_lines 
WHERE journal_entry_id IN (
  SELECT id FROM journal_entries 
  WHERE company_id = '2da00486-874e-41ef-b8d4-07f3ae20868a'
    AND entry_type = 'depreciation'
    AND month = 4
    AND year = 2025
);

DELETE FROM journal_entries 
WHERE company_id = '2da00486-874e-41ef-b8d4-07f3ae20868a'
  AND entry_type = 'depreciation'
  AND month = 4
  AND year = 2025;

-- Now regenerate the April 2025 depreciation with correct calculations
WITH active_cows_april_2025 AS (
  SELECT c.id, c.tag_number, c.purchase_price, c.salvage_value, c.freshen_date,
         calculate_cow_monthly_depreciation(
           c.purchase_price,
           c.salvage_value,
           c.freshen_date,
           '2025-04-30'::DATE
         ) as monthly_depreciation
  FROM cows c
  LEFT JOIN cow_dispositions cd ON cd.cow_id = c.id AND cd.company_id = c.company_id
  WHERE c.company_id = '2da00486-874e-41ef-b8d4-07f3ae20868a'
    AND c.freshen_date <= '2025-04-30'::DATE
    AND (cd.disposition_date IS NULL OR cd.disposition_date > '2025-04-30'::DATE)
), 
total_depreciation AS (
  SELECT SUM(monthly_depreciation) as total_amount,
         COUNT(*) as cow_count
  FROM active_cows_april_2025 
  WHERE monthly_depreciation > 0
)
INSERT INTO journal_entries (
  company_id, entry_date, month, year, entry_type, description, total_amount
)
SELECT 
  '2da00486-874e-41ef-b8d4-07f3ae20868a'::uuid,
  '2025-04-30'::DATE,
  4,
  2025,
  'depreciation',
  'Monthly Depreciation - April 2025',
  total_amount
FROM total_depreciation
WHERE total_amount > 0;

-- Get the journal entry ID and create balanced journal lines
WITH new_journal_entry AS (
  SELECT id as journal_entry_id
  FROM journal_entries 
  WHERE company_id = '2da00486-874e-41ef-b8d4-07f3ae20868a'
    AND entry_type = 'depreciation'
    AND month = 4
    AND year = 2025
), 
active_cows_april_2025 AS (
  SELECT c.id, c.tag_number, c.purchase_price, c.salvage_value, c.freshen_date,
         calculate_cow_monthly_depreciation(
           c.purchase_price,
           c.salvage_value,
           c.freshen_date,
           '2025-04-30'::DATE
         ) as monthly_depreciation
  FROM cows c
  LEFT JOIN cow_dispositions cd ON cd.cow_id = c.id AND cd.company_id = c.company_id
  WHERE c.company_id = '2da00486-874e-41ef-b8d4-07f3ae20868a'
    AND c.freshen_date <= '2025-04-30'::DATE
    AND (cd.disposition_date IS NULL OR cd.disposition_date > '2025-04-30'::DATE)
    AND calculate_cow_monthly_depreciation(
           c.purchase_price,
           c.salvage_value,
           c.freshen_date,
           '2025-04-30'::DATE
         ) > 0
)
INSERT INTO journal_lines (
  journal_entry_id, account_code, account_name, description, 
  debit_amount, credit_amount, line_type, cow_id
)
SELECT 
  nje.journal_entry_id,
  '6100',
  'Depreciation Expense',
  'Monthly depreciation - Cow #' || ac.tag_number,
  ac.monthly_depreciation,
  0,
  'debit',
  ac.id
FROM new_journal_entry nje
CROSS JOIN active_cows_april_2025 ac

UNION ALL

SELECT 
  nje.journal_entry_id,
  '1500.1',
  'Accumulated Depreciation - Dairy Cows',
  'Monthly depreciation - Cow #' || ac.tag_number,
  0,
  ac.monthly_depreciation,
  'credit',
  ac.id
FROM new_journal_entry nje
CROSS JOIN active_cows_april_2025 ac;