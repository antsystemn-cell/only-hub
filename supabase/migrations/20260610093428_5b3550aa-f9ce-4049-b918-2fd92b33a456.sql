
-- 1. Ensure one delivery request per order (race-safe).
ALTER TABLE public.delivery_requests
  ADD CONSTRAINT delivery_requests_order_id_unique UNIQUE (order_id);

-- 2. Webhook idempotency ledger.
CREATE TABLE public.webhook_events (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  provider TEXT NOT NULL,
  event_key TEXT NOT NULL,
  order_id UUID NULL REFERENCES public.orders(id) ON DELETE SET NULL,
  payload JSONB NULL,
  result JSONB NULL,
  processed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX webhook_events_provider_event_key_unique
  ON public.webhook_events (provider, event_key);
CREATE INDEX webhook_events_order_id_idx ON public.webhook_events (order_id);
CREATE INDEX webhook_events_processed_at_idx ON public.webhook_events (processed_at DESC);

GRANT SELECT ON public.webhook_events TO authenticated;
GRANT ALL ON public.webhook_events TO service_role;

ALTER TABLE public.webhook_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Platform admins can read webhook_events"
  ON public.webhook_events
  FOR SELECT
  TO authenticated
  USING (public.is_platform_admin(auth.uid()));
