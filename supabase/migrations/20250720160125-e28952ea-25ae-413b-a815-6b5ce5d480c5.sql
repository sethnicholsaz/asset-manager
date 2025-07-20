-- Create acquisition settings table for configurable defaults
CREATE TABLE public.acquisition_settings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id UUID NOT NULL,
  default_acquisition_type TEXT NOT NULL DEFAULT 'purchased',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  CONSTRAINT acquisition_settings_company_unique UNIQUE (company_id),
  CONSTRAINT acquisition_settings_type_check CHECK (default_acquisition_type IN ('purchased', 'raised'))
);

-- Enable Row Level Security
ALTER TABLE public.acquisition_settings ENABLE ROW LEVEL SECURITY;

-- Create policies for company access
CREATE POLICY "Users can access acquisition settings from their company" 
ON public.acquisition_settings 
FOR ALL 
USING (company_id IN (
  SELECT company_memberships.company_id
  FROM company_memberships
  WHERE company_memberships.user_id = auth.uid()
));

-- Add trigger for automatic timestamp updates
CREATE TRIGGER update_acquisition_settings_updated_at
BEFORE UPDATE ON public.acquisition_settings
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();