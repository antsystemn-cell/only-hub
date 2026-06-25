-- Webhook event idempotency: lock duplicate (provider, event_key) inserts at the database level
-- so concurrent OnlyCargo webhook retries can't both pass the application-level "already seen" check.
CREATE UNIQUE INDEX IF NOT EXISTS webhook_events_provider_event_key_uidx
  ON public.webhook_events (provider, event_key);