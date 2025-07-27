-- Fix missing disposition journal entries
-- There are 535 cows with disposition records but no corresponding journal entries
-- This is causing a $856,686.76 discrepancy in the dashboard

-- Create missing disposition journal entries for cows that have disposition records but no journal entries
INSERT INTO public.journal_entries (
  id,
  company_id,
  entry_date,
  entry_type,
  description,
  year,
  month,
  total_amount,
  status,
  created_at,
  updated_at
)
SELECT 
  gen_random_uuid(),
  c.company_id,
  cd.disposition_date,
  'disposition',
  'Disposition - ' || cd.disposition_type || ' - Cow ' || c.tag_number,
  EXTRACT(YEAR FROM cd.disposition_date)::integer,
  EXTRACT(MONTH FROM cd.disposition_date)::integer,
  c.purchase_price,
  'posted',
  NOW(),
  NOW()
FROM public.cows c
JOIN public.cow_dispositions cd ON c.id = cd.cow_id
LEFT JOIN public.journal_lines jl ON jl.cow_id = c.id 
  AND jl.account_code = '1500' 
  AND jl.account_name = 'Dairy Cows'
  AND jl.line_type = 'credit'
WHERE c.company_id = '2da00486-874e-41ef-b8d4-07f3ae20868a'
  AND jl.cow_id IS NULL;  -- Missing journal entry

-- Create journal lines for the missing disposition entries
INSERT INTO public.journal_lines (
  id,
  journal_entry_id,
  account_code,
  account_name,
  line_type,
  debit_amount,
  credit_amount,
  cow_id,
  description,
  created_at
)
SELECT 
  gen_random_uuid(),
  je.id,
  '1500',
  'Dairy Cows',
  'credit',
  0,
  c.purchase_price,
  c.id,
  'Disposition - ' || cd.disposition_type || ' - Cow ' || c.tag_number,
  NOW()
FROM public.cows c
JOIN public.cow_dispositions cd ON c.id = cd.cow_id
JOIN public.journal_entries je ON je.company_id = c.company_id
  AND je.entry_date = cd.disposition_date
  AND je.entry_type = 'disposition'
  AND je.description = 'Disposition - ' || cd.disposition_type || ' - Cow ' || c.tag_number
LEFT JOIN public.journal_lines jl ON jl.cow_id = c.id 
  AND jl.account_code = '1500' 
  AND jl.account_name = 'Dairy Cows'
  AND jl.line_type = 'credit'
WHERE c.company_id = '2da00486-874e-41ef-b8d4-07f3ae20868a'
  AND jl.cow_id IS NULL;  -- Missing journal entry 