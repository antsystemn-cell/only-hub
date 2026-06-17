
-- Public order tracking tokens
CREATE TABLE IF NOT EXISTS public.public_order_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL UNIQUE REFERENCES public.orders(id) ON DELETE CASCADE,
  public_token text NOT NULL UNIQUE,
  customer_phone text,
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '30 days'),
  is_active boolean NOT NULL DEFAULT true,
  open_count integer NOT NULL DEFAULT 0,
  last_accessed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_public_order_tokens_token ON public.public_order_tokens (public_token);
CREATE INDEX IF NOT EXISTS idx_public_order_tokens_order ON public.public_order_tokens (order_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.public_order_tokens TO authenticated;
GRANT ALL ON public.public_order_tokens TO service_role;

ALTER TABLE public.public_order_tokens ENABLE ROW LEVEL SECURITY;

-- staff can manage their merchant's tokens; platform admin can manage all
CREATE POLICY "public_order_tokens staff manage"
  ON public.public_order_tokens
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.orders o
      WHERE o.id = public_order_tokens.order_id
        AND (public.has_merchant_access(auth.uid(), o.merchant_id) OR public.is_platform_admin(auth.uid()))
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.orders o
      WHERE o.id = public_order_tokens.order_id
        AND (public.has_merchant_access(auth.uid(), o.merchant_id) OR public.is_platform_admin(auth.uid()))
    )
  );

CREATE TRIGGER public_order_tokens_set_updated_at
BEFORE UPDATE ON public.public_order_tokens
FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- one-time SMS marker on delivery assignment
ALTER TABLE public.delivery_requests
  ADD COLUMN IF NOT EXISTS tracking_sms_sent_at timestamptz;

-- default tracking SMS template
INSERT INTO public.platform_settings (key, value)
VALUES (
  'tracking_sms_template',
  jsonb_build_object(
    'message',
    'Tanii zahialgiig hurgeltend huleelgej ugluu.' || E'\n\n' ||
    'Ta daraah linkeer orj zahialga bolon hurgeltiin medeellee hyanaarai.' || E'\n' ||
    '{tracking_link}',
    'base_url', 'https://only.mn'
  )
) ON CONFLICT (key) DO NOTHING;
