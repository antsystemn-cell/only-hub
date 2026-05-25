ALTER TABLE public.merchants
  ADD COLUMN IF NOT EXISTS delivery_endpoint text,
  ADD COLUMN IF NOT EXISTS delivery_webhook_secret text;

CREATE TABLE IF NOT EXISTS public.delivery_webhooks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid,
  merchant_id uuid,
  event text,
  fulfillment_status text,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_delivery_webhooks_order ON public.delivery_webhooks(order_id);
CREATE INDEX IF NOT EXISTS idx_delivery_webhooks_merchant ON public.delivery_webhooks(merchant_id);

ALTER TABLE public.delivery_webhooks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "delivery_webhooks staff read"
  ON public.delivery_webhooks
  FOR SELECT
  USING (
    merchant_id IS NOT NULL
    AND (public.has_merchant_access(auth.uid(), merchant_id) OR public.is_platform_admin(auth.uid()))
  );
