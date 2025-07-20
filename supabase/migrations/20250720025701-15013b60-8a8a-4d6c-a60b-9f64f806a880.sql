-- Create depreciation_settings table for company-specific depreciation configuration
CREATE TABLE public.depreciation_settings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  default_depreciation_method TEXT NOT NULL DEFAULT 'straight-line' CHECK (default_depreciation_method IN ('straight-line', 'declining-balance', 'sum-of-years')),
  default_depreciation_years INTEGER NOT NULL DEFAULT 5 CHECK (default_depreciation_years > 0 AND default_depreciation_years <= 20),
  default_salvage_percentage NUMERIC NOT NULL DEFAULT 10 CHECK (default_salvage_percentage >= 0 AND default_salvage_percentage <= 50),
  auto_calculate_depreciation BOOLEAN NOT NULL DEFAULT true,
  monthly_calculation_day INTEGER NOT NULL DEFAULT 1 CHECK (monthly_calculation_day IN (1, 15, 31)),
  include_partial_months BOOLEAN NOT NULL DEFAULT true,
  round_to_nearest_dollar BOOLEAN NOT NULL DEFAULT true,
  fiscal_year_start_month INTEGER NOT NULL DEFAULT 1 CHECK (fiscal_year_start_month >= 1 AND fiscal_year_start_month <= 12),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(company_id)
);

-- Enable RLS
ALTER TABLE public.depreciation_settings ENABLE ROW LEVEL SECURITY;

-- Create RLS policies
CREATE POLICY "Users can access depreciation settings from their company" 
ON public.depreciation_settings FOR ALL 
USING (
  company_id IN (
    SELECT company_id FROM public.company_memberships 
    WHERE user_id = auth.uid()
  )
);

-- Add trigger for updated_at
CREATE TRIGGER update_depreciation_settings_updated_at
BEFORE UPDATE ON public.depreciation_settings
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();