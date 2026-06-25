
ALTER TABLE public.webhook_events
  ADD COLUMN IF NOT EXISTS processing_status text NOT NULL DEFAULT 'ok',
  ADD COLUMN IF NOT EXISTS error_message text,
  ADD COLUMN IF NOT EXISTS merchant_id uuid REFERENCES public.merchants(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS webhook_events_merchant_id_idx
  ON public.webhook_events (merchant_id);

ALTER TABLE public.merchants
  ADD COLUMN IF NOT EXISTS onlycargo_last_synced_at timestamptz,
  ADD COLUMN IF NOT EXISTS onlycargo_sync_error text;
