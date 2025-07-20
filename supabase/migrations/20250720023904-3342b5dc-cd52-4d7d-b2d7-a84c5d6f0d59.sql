-- Fix the company creation policy
-- Drop existing policy and recreate it properly
DROP POLICY IF EXISTS "Anyone can create a company" ON public.companies;

-- Create a proper policy for company creation
CREATE POLICY "Authenticated users can create companies" 
ON public.companies FOR INSERT 
TO authenticated
WITH CHECK (true);

-- Also ensure users can view companies they create/belong to
DROP POLICY IF EXISTS "Users can view companies they belong to" ON public.companies;
CREATE POLICY "Users can view companies they belong to" 
ON public.companies FOR SELECT 
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.company_memberships 
    WHERE company_id = companies.id 
    AND user_id = auth.uid()
  )
);