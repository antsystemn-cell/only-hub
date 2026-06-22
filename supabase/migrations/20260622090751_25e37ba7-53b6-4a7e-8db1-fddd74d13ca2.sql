ALTER TABLE public.merchants
  ADD COLUMN IF NOT EXISTS onlycargo_customer_code text;

CREATE INDEX IF NOT EXISTS idx_merchants_onlycargo_customer_code
  ON public.merchants (onlycargo_customer_code)
  WHERE onlycargo_customer_code IS NOT NULL;