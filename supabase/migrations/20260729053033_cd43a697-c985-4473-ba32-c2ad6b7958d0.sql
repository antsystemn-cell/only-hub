ALTER TABLE public.product_variants
  ADD COLUMN IF NOT EXISTS manual_price_override boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS manual_customer_price_mnt numeric,
  ADD COLUMN IF NOT EXISTS manual_price_at timestamptz,
  ADD COLUMN IF NOT EXISTS manual_price_by uuid;

COMMENT ON COLUMN public.product_variants.manual_price_override IS
  'When true, sync engine will not overwrite rounded_customer_price_mnt for this variant.';
COMMENT ON COLUMN public.product_variants.manual_customer_price_mnt IS
  'Merchant-set customer price in MNT. Copied into rounded_customer_price_mnt when override is on.';