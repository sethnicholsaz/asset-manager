-- Add posting period fields to journal entries tables
ALTER TABLE public.journal_entries 
ADD COLUMN posting_year INTEGER,
ADD COLUMN posting_month INTEGER,
ADD COLUMN posting_period TEXT GENERATED ALWAYS AS (posting_year || '-' || LPAD(posting_month::TEXT, 2, '0')) STORED;

ALTER TABLE public.stored_journal_entries 
ADD COLUMN posting_year INTEGER,
ADD COLUMN posting_month INTEGER,
ADD COLUMN posting_period TEXT GENERATED ALWAYS AS (posting_year || '-' || LPAD(posting_month::TEXT, 2, '0')) STORED;

-- Create table for tracking monthly depreciation per cow
CREATE TABLE public.cow_monthly_depreciation (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  cow_id TEXT NOT NULL,
  company_id UUID NOT NULL,
  year INTEGER NOT NULL,
  month INTEGER NOT NULL,
  posting_period TEXT GENERATED ALWAYS AS (year || '-' || LPAD(month::TEXT, 2, '0')) STORED,
  monthly_depreciation_amount NUMERIC NOT NULL DEFAULT 0,
  accumulated_depreciation NUMERIC NOT NULL DEFAULT 0,
  asset_value NUMERIC NOT NULL DEFAULT 0,
  journal_entry_id UUID,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(cow_id, company_id, year, month)
);

-- Enable RLS
ALTER TABLE public.cow_monthly_depreciation ENABLE ROW LEVEL SECURITY;

-- Create RLS policy
CREATE POLICY "Users can access cow depreciation from their company" 
ON public.cow_monthly_depreciation 
FOR ALL 
USING (company_id IN (
  SELECT company_memberships.company_id
  FROM company_memberships
  WHERE company_memberships.user_id = auth.uid()
));

-- Add trigger for updated_at
CREATE TRIGGER update_cow_monthly_depreciation_updated_at
BEFORE UPDATE ON public.cow_monthly_depreciation
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Add indexes for performance
CREATE INDEX idx_cow_monthly_depreciation_company_id ON public.cow_monthly_depreciation(company_id);
CREATE INDEX idx_cow_monthly_depreciation_posting_period ON public.cow_monthly_depreciation(posting_period);
CREATE INDEX idx_cow_monthly_depreciation_cow_id ON public.cow_monthly_depreciation(cow_id);

-- Add indexes for posting periods on journal tables
CREATE INDEX idx_journal_entries_posting_period ON public.journal_entries(posting_period);
CREATE INDEX idx_stored_journal_entries_posting_period ON public.stored_journal_entries(posting_period);