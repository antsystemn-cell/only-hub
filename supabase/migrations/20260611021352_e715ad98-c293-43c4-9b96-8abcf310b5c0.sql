
CREATE TABLE IF NOT EXISTS public.notifications_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid REFERENCES public.orders(id) ON DELETE CASCADE,
  merchant_id uuid REFERENCES public.merchants(id) ON DELETE SET NULL,
  event_type text NOT NULL,            -- 'paid' | 'delivered' | 'payment_requested' | 'sms_retry' | etc
  channel text NOT NULL DEFAULT 'sms', -- 'sms' | 'email' | 'webhook' | 'system'
  recipient text,                      -- phone/email
  status text NOT NULL DEFAULT 'sent', -- 'sent' | 'failed' | 'skipped' | 'pending'
  provider text,                       -- 'callpro' | 'qpay' | ...
  message text,
  error text,
  payload jsonb,
  attempt int NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_notifications_log_order ON public.notifications_log(order_id);
CREATE INDEX IF NOT EXISTS idx_notifications_log_merchant ON public.notifications_log(merchant_id);
CREATE INDEX IF NOT EXISTS idx_notifications_log_event ON public.notifications_log(event_type, status, created_at DESC);

GRANT SELECT ON public.notifications_log TO authenticated;
GRANT ALL ON public.notifications_log TO service_role;

ALTER TABLE public.notifications_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Platform admins read all notifications"
  ON public.notifications_log FOR SELECT TO authenticated
  USING (public.is_platform_admin(auth.uid()));

CREATE POLICY "Merchant staff read their notifications"
  ON public.notifications_log FOR SELECT TO authenticated
  USING (
    merchant_id IS NOT NULL
    AND public.has_merchant_access(auth.uid(), merchant_id)
  );
