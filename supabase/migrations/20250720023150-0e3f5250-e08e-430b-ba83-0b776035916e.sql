-- Create a security definer function to check user company access
-- This avoids infinite recursion in RLS policies
CREATE OR REPLACE FUNCTION public.user_has_company_access(company_uuid UUID)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.company_memberships 
    WHERE company_id = company_uuid 
    AND user_id = auth.uid()
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- Drop all existing policies that cause recursion
DROP POLICY IF EXISTS "Users can view their own memberships" ON public.company_memberships;
DROP POLICY IF EXISTS "Users can view memberships in companies they belong to" ON public.company_memberships; 
DROP POLICY IF EXISTS "Company owners can insert memberships" ON public.company_memberships;
DROP POLICY IF EXISTS "Company owners can update memberships" ON public.company_memberships;
DROP POLICY IF EXISTS "Company owners can delete memberships" ON public.company_memberships;
DROP POLICY IF EXISTS "Users can accept their own invitations" ON public.company_memberships;

-- Create simple, non-recursive policies
CREATE POLICY "Users can view their own memberships" 
ON public.company_memberships FOR SELECT 
USING (user_id = auth.uid());

CREATE POLICY "Users can insert their own membership" 
ON public.company_memberships FOR INSERT 
WITH CHECK (user_id = auth.uid());

CREATE POLICY "Company owners can manage all memberships" 
ON public.company_memberships FOR ALL
USING (
  user_id = auth.uid() OR 
  public.user_has_company_access(company_id)
);