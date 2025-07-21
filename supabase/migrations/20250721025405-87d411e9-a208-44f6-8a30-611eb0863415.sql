-- Fix the company creation RLS policy
DROP POLICY IF EXISTS "Authenticated users can create companies" ON public.companies;

-- Create a more explicit policy for company creation that ensures it works
CREATE POLICY "Allow authenticated users to create companies" 
ON public.companies 
FOR INSERT 
TO authenticated
WITH CHECK (true);

-- Also ensure the policy names are clear and don't conflict
DROP POLICY IF EXISTS "Users can view companies they belong to" ON public.companies;
CREATE POLICY "Users can view their companies" 
ON public.companies 
FOR SELECT 
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.company_memberships 
    WHERE company_id = companies.id 
    AND user_id = auth.uid()
  )
);