-- 1. Extend payment_providers
ALTER TABLE public.payment_providers
  ADD COLUMN IF NOT EXISTS config_status text NOT NULL DEFAULT 'incomplete',
  ADD COLUMN IF NOT EXISTS last_tested_at timestamptz,
  ADD COLUMN IF NOT EXISTS test_message text,
  ADD COLUMN IF NOT EXISTS is_platform_managed boolean NOT NULL DEFAULT false;

ALTER TABLE public.payment_providers ALTER COLUMN merchant_id DROP NOT NULL;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'payment_providers_owner_check') THEN
    ALTER TABLE public.payment_providers
      ADD CONSTRAINT payment_providers_owner_check
      CHECK (merchant_id IS NOT NULL OR is_platform_managed = true);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'payment_providers_status_check') THEN
    ALTER TABLE public.payment_providers
      ADD CONSTRAINT payment_providers_status_check
      CHECK (config_status IN ('incomplete','verified','failed'));
  END IF;
END $$;

-- Grant SELECT on the new safe columns (credentials remain service_role only)
GRANT SELECT (id, merchant_id, name, provider_type, logo_url, icon, description,
              is_active, position, config_status, last_tested_at, test_message,
              is_platform_managed, created_at, updated_at)
  ON public.payment_providers TO authenticated;
GRANT SELECT (id, merchant_id, name, provider_type, logo_url, icon, description,
              is_active, position, config_status, is_platform_managed)
  ON public.payment_providers TO anon;

-- Replace policies to include platform-managed rows being visible
DROP POLICY IF EXISTS "payment_providers public select" ON public.payment_providers;
DROP POLICY IF EXISTS "payment_providers select public" ON public.payment_providers;
CREATE POLICY "payment_providers select public"
  ON public.payment_providers FOR SELECT
  USING (
    is_active = true OR is_platform_managed = true OR
    (merchant_id IS NOT NULL AND public.has_merchant_access(auth.uid(), merchant_id))
  );

-- 2. Merchant opt-in for platform fallback providers
ALTER TABLE public.merchants
  ADD COLUMN IF NOT EXISTS use_platform_payment_fallback boolean NOT NULL DEFAULT false;

GRANT SELECT (id, use_platform_payment_fallback) ON public.merchants TO authenticated;
GRANT SELECT (id, use_platform_payment_fallback) ON public.merchants TO anon;

-- 3. payment_intents table
CREATE TABLE IF NOT EXISTS public.payment_intents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid REFERENCES public.orders(id) ON DELETE CASCADE,
  merchant_id uuid REFERENCES public.merchants(id) ON DELETE SET NULL,
  provider_id uuid REFERENCES public.payment_providers(id) ON DELETE SET NULL,
  provider_type text NOT NULL,
  amount numeric NOT NULL CHECK (amount >= 0),
  phone text,
  status text NOT NULL DEFAULT 'initiated'
    CHECK (status IN ('initiated','waiting','paid','failed','cancelled','expired')),
  invoice_id text,
  request_id text,
  qr_text text,
  qr_image text,
  deeplink text,
  urls jsonb,
  provider_response jsonb,
  is_platform_fallback boolean NOT NULL DEFAULT false,
  last_error text,
  paid_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.payment_intents TO anon, authenticated;
GRANT ALL ON public.payment_intents TO service_role;

ALTER TABLE public.payment_intents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "payment_intents read all" ON public.payment_intents;
CREATE POLICY "payment_intents read all"
  ON public.payment_intents FOR SELECT
  USING (true);

CREATE INDEX IF NOT EXISTS payment_intents_order_idx ON public.payment_intents (order_id);
CREATE INDEX IF NOT EXISTS payment_intents_status_idx ON public.payment_intents (status);
CREATE INDEX IF NOT EXISTS payment_intents_invoice_idx ON public.payment_intents (invoice_id);
CREATE INDEX IF NOT EXISTS payment_intents_request_idx ON public.payment_intents (request_id);

DROP TRIGGER IF EXISTS payment_intents_set_updated_at ON public.payment_intents;
CREATE TRIGGER payment_intents_set_updated_at
  BEFORE UPDATE ON public.payment_intents
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();