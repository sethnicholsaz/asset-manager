-- Create function to update timestamps
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create table for purchase price defaults by birth year
CREATE TABLE public.purchase_price_defaults (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  birth_year INTEGER NOT NULL UNIQUE,
  default_price DECIMAL(10,2) NOT NULL,
  daily_accrual_rate DECIMAL(8,4) DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable Row Level Security
ALTER TABLE public.purchase_price_defaults ENABLE ROW LEVEL SECURITY;

-- Create policy for public read access (everyone can view defaults)
CREATE POLICY "Purchase price defaults are viewable by everyone" 
ON public.purchase_price_defaults 
FOR SELECT 
USING (true);

-- Create policy for authenticated users to manage defaults
CREATE POLICY "Authenticated users can manage purchase price defaults" 
ON public.purchase_price_defaults 
FOR ALL 
USING (auth.uid() IS NOT NULL);

-- Create trigger for automatic timestamp updates
CREATE TRIGGER update_purchase_price_defaults_updated_at
BEFORE UPDATE ON public.purchase_price_defaults
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Insert some sample data
INSERT INTO public.purchase_price_defaults (birth_year, default_price, daily_accrual_rate) VALUES
(2020, 2000.00, 1.50),
(2021, 2100.00, 1.55),
(2022, 2200.00, 1.60),
(2023, 2300.00, 1.65),
(2024, 2400.00, 1.70);