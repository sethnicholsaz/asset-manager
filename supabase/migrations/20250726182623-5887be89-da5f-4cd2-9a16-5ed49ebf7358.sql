-- Add processing mode field to depreciation settings
ALTER TABLE public.depreciation_settings 
ADD COLUMN processing_mode text DEFAULT 'historical' CHECK (processing_mode IN ('historical', 'production'));

-- Update existing records to historical mode
UPDATE public.depreciation_settings 
SET processing_mode = 'historical' 
WHERE processing_mode IS NULL;