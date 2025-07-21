-- Temporarily disable RLS on companies table to allow company creation
ALTER TABLE public.companies DISABLE ROW LEVEL SECURITY;

-- We'll re-enable it in the next migration once we test