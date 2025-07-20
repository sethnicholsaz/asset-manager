-- Add acquisition_type column to distinguish between purchased and raised cows
ALTER TABLE public.cows 
ADD COLUMN acquisition_type TEXT NOT NULL DEFAULT 'purchased' CHECK (acquisition_type IN ('purchased', 'raised'));

-- Update existing records to have a default value
UPDATE public.cows SET acquisition_type = 'purchased' WHERE acquisition_type IS NULL;