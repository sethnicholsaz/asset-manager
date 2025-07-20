-- Create staging table for master file verification results
CREATE TABLE public.master_file_staging (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id UUID NOT NULL,
  verification_date TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  discrepancy_type TEXT NOT NULL, -- 'missing_from_master', 'needs_disposal', 'missing_freshen_date'
  cow_id TEXT, -- the cow ID from our database (for existing cows)
  tag_number TEXT NOT NULL,
  birth_date DATE NOT NULL,
  freshen_date DATE,
  current_status TEXT, -- current status in our database
  master_file_name TEXT,
  action_taken TEXT, -- 'pending', 'cow_added', 'cow_disposed', 'cow_reinstated', 'freshen_updated', 'ignored'
  action_date TIMESTAMP WITH TIME ZONE,
  action_notes TEXT,
  disposition_type TEXT, -- 'sale', 'death', 'culled' for disposal actions
  disposition_date DATE,
  sale_amount NUMERIC DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.master_file_staging ENABLE ROW LEVEL SECURITY;

-- Create RLS policy
CREATE POLICY "Users can access staging data from their company" 
ON public.master_file_staging 
FOR ALL 
USING (company_id IN (
  SELECT company_memberships.company_id
  FROM company_memberships
  WHERE company_memberships.user_id = auth.uid()
));

-- Add trigger for updated_at
CREATE TRIGGER update_master_file_staging_updated_at
BEFORE UPDATE ON public.master_file_staging
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Add indexes for performance
CREATE INDEX idx_master_file_staging_company_id ON public.master_file_staging(company_id);
CREATE INDEX idx_master_file_staging_action_taken ON public.master_file_staging(action_taken);
CREATE INDEX idx_master_file_staging_verification_date ON public.master_file_staging(verification_date);