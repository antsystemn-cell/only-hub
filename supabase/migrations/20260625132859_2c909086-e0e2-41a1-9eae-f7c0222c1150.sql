ALTER TABLE public.merchants
  ADD COLUMN IF NOT EXISTS onlycargo_phone text;

CREATE INDEX IF NOT EXISTS idx_merchants_onlycargo_phone
  ON public.merchants (onlycargo_phone)
  WHERE onlycargo_phone IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_merchants_onlycargo_customer_code_unique
  ON public.merchants (onlycargo_customer_code)
  WHERE onlycargo_customer_code IS NOT NULL;