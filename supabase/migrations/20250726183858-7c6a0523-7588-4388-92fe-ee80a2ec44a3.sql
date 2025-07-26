-- Add a flag to track when historical processing has been completed
ALTER TABLE public.depreciation_settings 
ADD COLUMN historical_processing_completed boolean DEFAULT false;