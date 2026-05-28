
-- ============================================================
-- 1. delivery_requests
-- ============================================================
CREATE TABLE IF NOT EXISTS public.delivery_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL,
  merchant_id uuid NOT NULL,
  mode text NOT NULL DEFAULT 'local', -- 'local' | 'external'
  provider text, -- e.g. 'swift', 'hurgelt'
  external_ref text,
  status text NOT NULL DEFAULT 'pending',
  -- pending | requested | assigned | picked_up | in_transit | delivered | failed | cancelled
  driver_id uuid,
  pickup_address text,
  dropoff_address text,
  recipient_name text,
  recipient_phone text,
  fee numeric NOT NULL DEFAULT 0,
  package_info jsonb NOT NULL DEFAULT '{}'::jsonb,
  note text,
  last_error text,
  requested_at timestamptz,
  assigned_at timestamptz,
  picked_up_at timestamptz,
  delivered_at timestamptz,
  cancelled_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_delivery_requests_order ON public.delivery_requests(order_id);
CREATE INDEX IF NOT EXISTS idx_delivery_requests_merchant ON public.delivery_requests(merchant_id);
CREATE INDEX IF NOT EXISTS idx_delivery_requests_driver ON public.delivery_requests(driver_id);
CREATE INDEX IF NOT EXISTS idx_delivery_requests_status ON public.delivery_requests(status);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.delivery_requests TO authenticated;
GRANT ALL ON public.delivery_requests TO service_role;

ALTER TABLE public.delivery_requests ENABLE ROW LEVEL SECURITY;

-- Staff (merchant_owner/admin/moderator/driver of that merchant) OR platform admin
CREATE POLICY "delivery_requests staff read"
  ON public.delivery_requests FOR SELECT
  USING (
    public.has_merchant_access(auth.uid(), merchant_id)
    OR public.is_platform_admin(auth.uid())
    OR driver_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.orders o
      WHERE o.id = delivery_requests.order_id
        AND o.user_id = auth.uid()
    )
  );

CREATE POLICY "delivery_requests staff write"
  ON public.delivery_requests FOR ALL
  USING (
    public.has_merchant_access(auth.uid(), merchant_id)
    OR public.is_platform_admin(auth.uid())
  )
  WITH CHECK (
    public.has_merchant_access(auth.uid(), merchant_id)
    OR public.is_platform_admin(auth.uid())
  );

-- Drivers can update their own assigned deliveries (status only)
CREATE POLICY "delivery_requests driver update"
  ON public.delivery_requests FOR UPDATE
  USING (driver_id = auth.uid())
  WITH CHECK (driver_id = auth.uid());

-- ============================================================
-- 2. delivery_status_history
-- ============================================================
CREATE TABLE IF NOT EXISTS public.delivery_status_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  delivery_request_id uuid NOT NULL REFERENCES public.delivery_requests(id) ON DELETE CASCADE,
  status text NOT NULL,
  note text,
  changed_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_delivery_history_dr ON public.delivery_status_history(delivery_request_id);

GRANT SELECT ON public.delivery_status_history TO authenticated;
GRANT ALL ON public.delivery_status_history TO service_role;

ALTER TABLE public.delivery_status_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "delivery_history read"
  ON public.delivery_status_history FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.delivery_requests dr
      WHERE dr.id = delivery_status_history.delivery_request_id
        AND (
          public.has_merchant_access(auth.uid(), dr.merchant_id)
          OR public.is_platform_admin(auth.uid())
          OR dr.driver_id = auth.uid()
          OR EXISTS (
            SELECT 1 FROM public.orders o
            WHERE o.id = dr.order_id AND o.user_id = auth.uid()
          )
        )
    )
  );

-- ============================================================
-- 3. platform_settings (key/value)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.platform_settings (
  key text PRIMARY KEY,
  value jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid
);

GRANT SELECT ON public.platform_settings TO authenticated, anon;
GRANT ALL ON public.platform_settings TO service_role;

ALTER TABLE public.platform_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "platform_settings public read"
  ON public.platform_settings FOR SELECT USING (true);

CREATE POLICY "platform_settings admin write"
  ON public.platform_settings FOR ALL
  USING (public.is_platform_admin(auth.uid()))
  WITH CHECK (public.is_platform_admin(auth.uid()));

-- Seed defaults
INSERT INTO public.platform_settings (key, value) VALUES
  ('default_commission_rate', '3'::jsonb),
  ('default_delivery_fee', '5000'::jsonb),
  ('delivery_fee_rules', '{"flat": 5000, "free_over": 100000}'::jsonb)
ON CONFLICT (key) DO NOTHING;

-- ============================================================
-- 4. Migration source columns
-- ============================================================
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS source_system text NOT NULL DEFAULT 'native',
  ADD COLUMN IF NOT EXISTS source_order_id text,
  ADD COLUMN IF NOT EXISTS legacy_metadata jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS source_system text NOT NULL DEFAULT 'native',
  ADD COLUMN IF NOT EXISTS source_product_id text,
  ADD COLUMN IF NOT EXISTS legacy_metadata jsonb NOT NULL DEFAULT '{}'::jsonb;

-- Merchant delivery mode
ALTER TABLE public.merchants
  ADD COLUMN IF NOT EXISTS delivery_mode text NOT NULL DEFAULT 'local'; -- 'local' | 'swift'

-- delivery_webhooks link to delivery_request
ALTER TABLE public.delivery_webhooks
  ADD COLUMN IF NOT EXISTS delivery_request_id uuid REFERENCES public.delivery_requests(id) ON DELETE SET NULL;

-- ============================================================
-- 5. Triggers
-- ============================================================
CREATE OR REPLACE FUNCTION public.tg_delivery_request_history()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' OR NEW.status IS DISTINCT FROM OLD.status THEN
    INSERT INTO public.delivery_status_history (delivery_request_id, status, note, changed_by)
    VALUES (NEW.id, NEW.status, NEW.last_error, auth.uid());

    -- Sync order.delivery_status
    UPDATE public.orders
       SET delivery_status = NEW.status,
           updated_at = now(),
           status = CASE
             WHEN NEW.status = 'delivered' THEN 'completed'
             WHEN NEW.status IN ('picked_up','in_transit','assigned') THEN 'delivering'
             WHEN NEW.status = 'cancelled' THEN 'cancelled'
             ELSE orders.status
           END
     WHERE id = NEW.order_id;
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_delivery_request_history ON public.delivery_requests;
CREATE TRIGGER trg_delivery_request_history
  BEFORE INSERT OR UPDATE ON public.delivery_requests
  FOR EACH ROW EXECUTE FUNCTION public.tg_delivery_request_history();

-- ============================================================
-- 6. Realtime
-- ============================================================
ALTER PUBLICATION supabase_realtime ADD TABLE public.delivery_requests;
ALTER PUBLICATION supabase_realtime ADD TABLE public.delivery_status_history;
