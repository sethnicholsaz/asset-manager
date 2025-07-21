-- Re-enable RLS on companies table with a working policy
ALTER TABLE public.companies ENABLE ROW LEVEL SECURITY;

-- Create a simple policy that allows authenticated users to create companies
CREATE POLICY "Authenticated users can create companies" 
ON public.companies 
FOR INSERT 
TO authenticated
WITH CHECK (auth.uid() IS NOT NULL);

-- Keep the existing view policy
-- (Users can view their companies policy already exists)