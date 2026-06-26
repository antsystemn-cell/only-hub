
ALTER TABLE public.merchants
  ADD COLUMN IF NOT EXISTS onlycargo_phone_verified_at timestamptz,
  ADD COLUMN IF NOT EXISTS onlycargo_phone_pending text,
  ADD COLUMN IF NOT EXISTS onlycargo_phone_pending_at timestamptz;

CREATE TABLE IF NOT EXISTS public.merchant_cargo_otps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id uuid NOT NULL REFERENCES public.merchants(id) ON DELETE CASCADE,
  phone text NOT NULL,
  code_hash text NOT NULL,
  expires_at timestamptz NOT NULL,
  attempts int NOT NULL DEFAULT 0,
  consumed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT ALL ON public.merchant_cargo_otps TO service_role;
ALTER TABLE public.merchant_cargo_otps ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_merchant_cargo_otps_lookup
  ON public.merchant_cargo_otps (merchant_id, created_at DESC);
