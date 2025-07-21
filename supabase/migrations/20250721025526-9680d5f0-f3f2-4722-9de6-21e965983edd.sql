-- Fix company membership RLS policies to avoid recursion during company creation
DROP POLICY IF EXISTS "Company owners can manage all memberships" ON public.company_memberships;
DROP POLICY IF EXISTS "Users can insert their own membership" ON public.company_memberships;
DROP POLICY IF EXISTS "Users can view their own memberships" ON public.company_memberships;

-- Create simpler, non-recursive policies
CREATE POLICY "Users can view their own memberships" 
ON public.company_memberships 
FOR SELECT 
TO authenticated
USING (user_id = auth.uid());

CREATE POLICY "Users can create their own membership" 
ON public.company_memberships 
FOR INSERT 
TO authenticated
WITH CHECK (user_id = auth.uid());

CREATE POLICY "Company owners can manage memberships" 
ON public.company_memberships 
FOR UPDATE 
TO authenticated
USING (
  user_id = auth.uid() OR 
  EXISTS (
    SELECT 1 FROM public.company_memberships cm 
    WHERE cm.company_id = company_memberships.company_id 
    AND cm.user_id = auth.uid() 
    AND cm.role IN ('owner', 'admin')
  )
);

CREATE POLICY "Company owners can delete memberships" 
ON public.company_memberships 
FOR DELETE 
TO authenticated
USING (
  user_id = auth.uid() OR 
  EXISTS (
    SELECT 1 FROM public.company_memberships cm 
    WHERE cm.company_id = company_memberships.company_id 
    AND cm.user_id = auth.uid() 
    AND cm.role IN ('owner', 'admin')
  )
);