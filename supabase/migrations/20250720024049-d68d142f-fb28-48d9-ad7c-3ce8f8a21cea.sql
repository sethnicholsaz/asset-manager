-- Re-enable RLS on companies table now that initial setup is complete
ALTER TABLE public.companies ENABLE ROW LEVEL SECURITY;

-- The policies should already be in place from before, but let's make sure they exist
-- This will only create them if they don't already exist

DO $$
BEGIN
    -- Policy for authenticated users to create companies
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE schemaname = 'public' 
        AND tablename = 'companies' 
        AND policyname = 'Authenticated users can create companies'
    ) THEN
        CREATE POLICY "Authenticated users can create companies" 
        ON public.companies FOR INSERT 
        TO authenticated
        WITH CHECK (true);
    END IF;

    -- Policy for users to view companies they belong to
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE schemaname = 'public' 
        AND tablename = 'companies' 
        AND policyname = 'Users can view companies they belong to'
    ) THEN
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
    END IF;
END $$;