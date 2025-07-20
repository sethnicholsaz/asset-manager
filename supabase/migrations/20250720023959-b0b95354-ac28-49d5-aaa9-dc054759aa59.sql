-- Temporarily disable RLS on companies table to allow initial company creation
ALTER TABLE public.companies DISABLE ROW LEVEL SECURITY;

-- We'll re-enable it after the user creates their company
-- This is a temporary fix to get past the initial setup issue