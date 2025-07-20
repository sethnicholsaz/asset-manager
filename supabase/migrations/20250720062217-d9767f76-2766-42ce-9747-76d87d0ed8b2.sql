-- Create table for custom GL account mappings
CREATE TABLE public.gl_account_settings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id UUID NOT NULL,
  account_type TEXT NOT NULL CHECK (account_type IN ('cash', 'dairy_cows', 'accumulated_depreciation', 'depreciation_expense', 'gain_on_sale', 'loss_on_sale')),
  account_code TEXT NOT NULL,
  account_name TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(company_id, account_type)
);

-- Enable RLS
ALTER TABLE public.gl_account_settings ENABLE ROW LEVEL SECURITY;

-- Create RLS policy
CREATE POLICY "Users can access GL settings from their company" 
ON public.gl_account_settings 
FOR ALL 
USING (company_id IN (
  SELECT company_memberships.company_id
  FROM company_memberships
  WHERE company_memberships.user_id = auth.uid()
));

-- Create trigger for updated_at
CREATE TRIGGER update_gl_account_settings_updated_at
BEFORE UPDATE ON public.gl_account_settings
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Insert default GL account mappings for existing companies
INSERT INTO public.gl_account_settings (company_id, account_type, account_code, account_name)
SELECT DISTINCT c.id, 'cash', '1000', 'Cash'
FROM companies c
WHERE NOT EXISTS (
  SELECT 1 FROM gl_account_settings g 
  WHERE g.company_id = c.id AND g.account_type = 'cash'
);

INSERT INTO public.gl_account_settings (company_id, account_type, account_code, account_name)
SELECT DISTINCT c.id, 'dairy_cows', '1500', 'Dairy Cows'
FROM companies c
WHERE NOT EXISTS (
  SELECT 1 FROM gl_account_settings g 
  WHERE g.company_id = c.id AND g.account_type = 'dairy_cows'
);

INSERT INTO public.gl_account_settings (company_id, account_type, account_code, account_name)
SELECT DISTINCT c.id, 'accumulated_depreciation', '1500.1', 'Accumulated Depreciation - Dairy Cows'
FROM companies c
WHERE NOT EXISTS (
  SELECT 1 FROM gl_account_settings g 
  WHERE g.company_id = c.id AND g.account_type = 'accumulated_depreciation'
);

INSERT INTO public.gl_account_settings (company_id, account_type, account_code, account_name)
SELECT DISTINCT c.id, 'depreciation_expense', '6100', 'Depreciation Expense'
FROM companies c
WHERE NOT EXISTS (
  SELECT 1 FROM gl_account_settings g 
  WHERE g.company_id = c.id AND g.account_type = 'depreciation_expense'
);

INSERT INTO public.gl_account_settings (company_id, account_type, account_code, account_name)
SELECT DISTINCT c.id, 'gain_on_sale', '8000', 'Gain on Sale of Assets'
FROM companies c
WHERE NOT EXISTS (
  SELECT 1 FROM gl_account_settings g 
  WHERE g.company_id = c.id AND g.account_type = 'gain_on_sale'
);

INSERT INTO public.gl_account_settings (company_id, account_type, account_code, account_name)
SELECT DISTINCT c.id, 'loss_on_sale', '9000', 'Loss on Sale of Assets'
FROM companies c
WHERE NOT EXISTS (
  SELECT 1 FROM gl_account_settings g 
  WHERE g.company_id = c.id AND g.account_type = 'loss_on_sale'
);