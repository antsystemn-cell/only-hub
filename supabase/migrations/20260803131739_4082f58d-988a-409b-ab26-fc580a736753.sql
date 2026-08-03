-- Add Yuan pricing fields to product_variants to persist manual Yuan calculations
ALTER TABLE public.product_variants 
ADD COLUMN IF NOT EXISTS use_yuan_pricing BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS yuan_price DECIMAL,
ADD COLUMN IF NOT EXISTS yuan_exchange_rate DECIMAL DEFAULT 535,
ADD COLUMN IF NOT EXISTS yuan_profit_margin_percent DECIMAL DEFAULT 25,
ADD COLUMN IF NOT EXISTS yuan_extra_fixed_fee_mnt DECIMAL DEFAULT 30000;

-- Ensure RLS and Grants (standard for these tables)
GRANT SELECT, INSERT, UPDATE, DELETE ON public.product_variants TO authenticated;
GRANT ALL ON public.product_variants TO service_role;