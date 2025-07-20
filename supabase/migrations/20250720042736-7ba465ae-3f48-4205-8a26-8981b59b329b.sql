-- Create upload_tokens table for managing CSV upload access
CREATE TABLE public.upload_tokens (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id UUID NOT NULL,
  token_name TEXT NOT NULL,
  token_value TEXT NOT NULL UNIQUE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  last_used_at TIMESTAMP WITH TIME ZONE,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_by UUID
);

-- Enable Row Level Security
ALTER TABLE public.upload_tokens ENABLE ROW LEVEL SECURITY;

-- Create policies for upload tokens
CREATE POLICY "Users can access upload tokens from their company" 
ON public.upload_tokens 
FOR ALL 
USING (company_id IN (
  SELECT company_memberships.company_id
  FROM company_memberships
  WHERE company_memberships.user_id = auth.uid()
));

-- Create trigger for automatic timestamp updates
CREATE TRIGGER update_upload_tokens_updated_at
BEFORE UPDATE ON public.upload_tokens
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Create index for better performance
CREATE INDEX idx_upload_tokens_company_id ON public.upload_tokens(company_id);
CREATE INDEX idx_upload_tokens_token_value ON public.upload_tokens(token_value);