DROP INDEX IF EXISTS public.idx_merchants_onlycargo_phone;
CREATE UNIQUE INDEX IF NOT EXISTS idx_merchants_onlycargo_phone
  ON public.merchants (onlycargo_phone)
  WHERE onlycargo_phone IS NOT NULL;