-- Fix the infinite recursion in RLS policies by restructuring them

-- Drop the problematic policies
DROP POLICY IF EXISTS "Users can view memberships for their companies" ON public.company_memberships;
DROP POLICY IF EXISTS "Company owners can manage memberships" ON public.company_memberships;

-- Create simpler, non-recursive policies for company_memberships
CREATE POLICY "Users can view their own memberships" 
ON public.company_memberships FOR SELECT 
USING (user_id = auth.uid());

CREATE POLICY "Users can view memberships in companies they belong to" 
ON public.company_memberships FOR SELECT 
USING (
  company_id IN (
    SELECT cm.company_id 
    FROM public.company_memberships cm 
    WHERE cm.user_id = auth.uid()
  )
);

-- Allow company owners to insert/update/delete memberships
CREATE POLICY "Company owners can insert memberships" 
ON public.company_memberships FOR INSERT 
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.company_memberships existing
    WHERE existing.company_id = company_memberships.company_id 
    AND existing.user_id = auth.uid() 
    AND existing.role = 'owner'
  )
);

CREATE POLICY "Company owners can update memberships" 
ON public.company_memberships FOR UPDATE 
USING (
  EXISTS (
    SELECT 1 FROM public.company_memberships existing
    WHERE existing.company_id = company_memberships.company_id 
    AND existing.user_id = auth.uid() 
    AND existing.role = 'owner'
  )
);

CREATE POLICY "Company owners can delete memberships" 
ON public.company_memberships FOR DELETE 
USING (
  EXISTS (
    SELECT 1 FROM public.company_memberships existing
    WHERE existing.company_id = company_memberships.company_id 
    AND existing.user_id = auth.uid() 
    AND existing.role = 'owner'
  )
);

-- Allow users to insert their own membership when accepting invitations
CREATE POLICY "Users can accept their own invitations" 
ON public.company_memberships FOR INSERT 
WITH CHECK (user_id = auth.uid());

-- Also need to allow company creation for new users
DROP POLICY IF EXISTS "Company owners and admins can update their company" ON public.companies;

CREATE POLICY "Anyone can create a company" 
ON public.companies FOR INSERT 
WITH CHECK (true);

CREATE POLICY "Company members can update their company" 
ON public.companies FOR UPDATE 
USING (
  EXISTS (
    SELECT 1 FROM public.company_memberships 
    WHERE company_id = companies.id 
    AND user_id = auth.uid() 
    AND role IN ('owner', 'admin')
  )
);