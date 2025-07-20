-- Create companies table
CREATE TABLE public.companies (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  subscription_status TEXT DEFAULT 'trial' CHECK (subscription_status IN ('trial', 'active', 'cancelled', 'past_due')),
  trial_ends_at TIMESTAMP WITH TIME ZONE DEFAULT (now() + INTERVAL '14 days'),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create user profiles table
CREATE TABLE public.profiles (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE,
  email TEXT NOT NULL,
  first_name TEXT,
  last_name TEXT,
  avatar_url TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create company memberships table
CREATE TABLE public.company_memberships (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('owner', 'admin', 'member')),
  invited_by UUID REFERENCES auth.users(id),
  invited_at TIMESTAMP WITH TIME ZONE,
  accepted_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(company_id, user_id)
);

-- Add company_id to existing tables
ALTER TABLE public.cows 
ADD COLUMN company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE;

ALTER TABLE public.cow_dispositions 
ADD COLUMN company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE;

ALTER TABLE public.journal_entries 
ADD COLUMN company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE;

ALTER TABLE public.purchase_price_defaults 
ADD COLUMN company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE;

-- Enable RLS on new tables
ALTER TABLE public.companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.company_memberships ENABLE ROW LEVEL SECURITY;

-- Create RLS policies for companies
CREATE POLICY "Users can view companies they belong to" 
ON public.companies FOR SELECT 
USING (
  EXISTS (
    SELECT 1 FROM public.company_memberships 
    WHERE company_id = companies.id 
    AND user_id = auth.uid()
  )
);

CREATE POLICY "Company owners and admins can update their company" 
ON public.companies FOR UPDATE 
USING (
  EXISTS (
    SELECT 1 FROM public.company_memberships 
    WHERE company_id = companies.id 
    AND user_id = auth.uid() 
    AND role IN ('owner', 'admin')
  )
);

-- Create RLS policies for profiles
CREATE POLICY "Users can view all profiles" 
ON public.profiles FOR SELECT 
USING (true);

CREATE POLICY "Users can update their own profile" 
ON public.profiles FOR UPDATE 
USING (user_id = auth.uid());

CREATE POLICY "Users can insert their own profile" 
ON public.profiles FOR INSERT 
WITH CHECK (user_id = auth.uid());

-- Create RLS policies for company memberships
CREATE POLICY "Users can view memberships for their companies" 
ON public.company_memberships FOR SELECT 
USING (
  user_id = auth.uid() OR
  EXISTS (
    SELECT 1 FROM public.company_memberships cm
    WHERE cm.company_id = company_memberships.company_id 
    AND cm.user_id = auth.uid()
  )
);

CREATE POLICY "Company owners can manage memberships" 
ON public.company_memberships FOR ALL 
USING (
  EXISTS (
    SELECT 1 FROM public.company_memberships 
    WHERE company_id = company_memberships.company_id 
    AND user_id = auth.uid() 
    AND role = 'owner'
  )
);

-- Update existing RLS policies to be company-scoped
DROP POLICY IF EXISTS "Public access to cows" ON public.cows;
CREATE POLICY "Users can access cows from their company" 
ON public.cows FOR ALL 
USING (
  company_id IN (
    SELECT company_id FROM public.company_memberships 
    WHERE user_id = auth.uid()
  )
);

DROP POLICY IF EXISTS "Public access to cow dispositions" ON public.cow_dispositions;
CREATE POLICY "Users can access dispositions from their company" 
ON public.cow_dispositions FOR ALL 
USING (
  company_id IN (
    SELECT company_id FROM public.company_memberships 
    WHERE user_id = auth.uid()
  )
);

DROP POLICY IF EXISTS "Public access to journal entries" ON public.journal_entries;
CREATE POLICY "Users can access journal entries from their company" 
ON public.journal_entries FOR ALL 
USING (
  company_id IN (
    SELECT company_id FROM public.company_memberships 
    WHERE user_id = auth.uid()
  )
);

DROP POLICY IF EXISTS "Purchase price defaults are viewable by everyone" ON public.purchase_price_defaults;
DROP POLICY IF EXISTS "Authenticated users can manage purchase price defaults" ON public.purchase_price_defaults;
CREATE POLICY "Users can access price defaults from their company" 
ON public.purchase_price_defaults FOR ALL 
USING (
  company_id IN (
    SELECT company_id FROM public.company_memberships 
    WHERE user_id = auth.uid()
  )
);

-- Create triggers for updated_at columns
CREATE TRIGGER update_companies_updated_at
BEFORE UPDATE ON public.companies
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_profiles_updated_at
BEFORE UPDATE ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_company_memberships_updated_at
BEFORE UPDATE ON public.company_memberships
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();