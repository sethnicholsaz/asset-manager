-- Create balance_adjustments table for tracking prior period corrections
CREATE TABLE public.balance_adjustments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id UUID NOT NULL,
  adjustment_date DATE NOT NULL DEFAULT CURRENT_DATE,
  prior_period_month INTEGER NOT NULL,
  prior_period_year INTEGER NOT NULL,
  adjustment_type TEXT NOT NULL CHECK (adjustment_type IN ('depreciation', 'disposition', 'purchase_price', 'other')),
  adjustment_amount NUMERIC NOT NULL,
  description TEXT NOT NULL,
  cow_tag TEXT,
  applied_to_current_month BOOLEAN NOT NULL DEFAULT false,
  journal_entry_id UUID,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.balance_adjustments ENABLE ROW LEVEL SECURITY;

-- Create policies for company-based access
CREATE POLICY "Users can access balance adjustments from their company" 
ON public.balance_adjustments 
FOR ALL 
USING (company_id IN (
  SELECT company_memberships.company_id
  FROM company_memberships
  WHERE company_memberships.user_id = auth.uid()
));

-- Create trigger for automatic timestamp updates
CREATE TRIGGER update_balance_adjustments_updated_at
BEFORE UPDATE ON public.balance_adjustments
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();