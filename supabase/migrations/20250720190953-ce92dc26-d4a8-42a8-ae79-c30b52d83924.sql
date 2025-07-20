-- Update all existing sale amounts to 0
UPDATE public.cow_dispositions 
SET sale_amount = 0,
    gain_loss = 0 - final_book_value, -- Recalculate gain/loss as negative of final book value
    updated_at = now();