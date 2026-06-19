
-- ============================================================
-- Foreign Order Products — Phase 1: Schema + Permissions
-- ============================================================

-- 1. Enums --------------------------------------------------
DO $$ BEGIN
  CREATE TYPE public.product_type AS ENUM ('READY_STOCK','FOREIGN_ORDER');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.foreign_source AS ENUM (
    'POIZON_KR','DEWU_CN','TAOBAO','TMALL','ALIBABA_1688','AMAZON','MANUAL_EXTERNAL'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.variant_availability AS ENUM ('AVAILABLE','UNAVAILABLE','UNKNOWN','NEEDS_REVIEW');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.source_sync_status AS ENUM ('OK','PENDING','FAILED','NEEDS_REVIEW');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.foreign_fulfillment_status AS ENUM (
    'PAID','WAITING_SOURCE_PURCHASE','SOURCE_PURCHASED','KOREA_WAREHOUSE_RECEIVED',
    'INTERNATIONAL_TRANSIT','UB_ARRIVED','DELIVERY_ASSIGNED','DELIVERED',
    'SOURCE_PURCHASE_FAILED','REFUNDED','CANCELLED'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.price_sync_mode AS ENUM ('AUTO_UPDATE_CUSTOMER_PRICE','REVIEW_BEFORE_UPDATE','AVAILABILITY_ONLY');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 2. Merchant-level permissions ----------------------------
ALTER TABLE public.merchants
  ADD COLUMN IF NOT EXISTS can_create_foreign_order_products boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS allowed_foreign_sources foreign_source[] NOT NULL DEFAULT '{}'::foreign_source[];

-- 3. Products: extend with type + foreign source fields ----
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS product_type product_type NOT NULL DEFAULT 'READY_STOCK',
  ADD COLUMN IF NOT EXISTS foreign_source foreign_source,
  ADD COLUMN IF NOT EXISTS source_url text,
  ADD COLUMN IF NOT EXISTS source_country text,
  ADD COLUMN IF NOT EXISTS source_currency text,
  ADD COLUMN IF NOT EXISTS source_name text,
  ADD COLUMN IF NOT EXISTS default_delivery_min_days int,
  ADD COLUMN IF NOT EXISTS default_delivery_max_days int,
  ADD COLUMN IF NOT EXISTS last_source_sync_at timestamptz,
  ADD COLUMN IF NOT EXISTS source_sync_status source_sync_status;

CREATE INDEX IF NOT EXISTS products_product_type_idx ON public.products(product_type);
CREATE INDEX IF NOT EXISTS products_foreign_source_idx ON public.products(foreign_source) WHERE foreign_source IS NOT NULL;

-- 4. product_variants (foreign-order variants with priced snapshots)
CREATE TABLE IF NOT EXISTS public.product_variants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  label text,
  size_label text,
  color_label text,
  source_variant_id text,
  source_price numeric(14,2),
  source_currency text,
  exchange_rate numeric(14,6),
  source_price_mnt numeric(14,2),
  korea_domestic_shipping_mnt numeric(14,2) DEFAULT 0,
  cargo_cost_mnt numeric(14,2) DEFAULT 0,
  local_delivery_cost_mnt numeric(14,2) DEFAULT 0,
  payment_fee_reserve_mnt numeric(14,2) DEFAULT 0,
  risk_buffer_mnt numeric(14,2) DEFAULT 0,
  profit_percent numeric(6,2) DEFAULT 0,
  minimum_profit_mnt numeric(14,2) DEFAULT 0,
  profit_amount_mnt numeric(14,2) DEFAULT 0,
  final_customer_price_mnt numeric(14,2),
  rounded_customer_price_mnt numeric(14,2),
  availability_status variant_availability NOT NULL DEFAULT 'UNKNOWN',
  source_availability_status text,
  is_visible boolean NOT NULL DEFAULT true,
  is_purchasable boolean NOT NULL DEFAULT false,
  last_price_sync_at timestamptz,
  last_availability_sync_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.product_variants TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.product_variants TO authenticated;
GRANT ALL ON public.product_variants TO service_role;

ALTER TABLE public.product_variants ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public can view visible variants"
  ON public.product_variants FOR SELECT
  USING (
    is_visible = true
    AND EXISTS (SELECT 1 FROM public.products p WHERE p.id = product_id AND p.is_active = true)
  );

CREATE POLICY "Merchant staff can manage their variants"
  ON public.product_variants FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.products p
      WHERE p.id = product_id
        AND public.has_merchant_access(auth.uid(), p.merchant_id)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.products p
      WHERE p.id = product_id
        AND public.has_merchant_access(auth.uid(), p.merchant_id)
    )
  );

CREATE INDEX IF NOT EXISTS product_variants_product_id_idx ON public.product_variants(product_id);
CREATE INDEX IF NOT EXISTS product_variants_source_variant_idx ON public.product_variants(source_variant_id);

CREATE TRIGGER trg_product_variants_updated_at
  BEFORE UPDATE ON public.product_variants
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- 5. merchant_foreign_source_settings ----------------------
CREATE TABLE IF NOT EXISTS public.merchant_foreign_source_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id uuid NOT NULL REFERENCES public.merchants(id) ON DELETE CASCADE,
  source foreign_source NOT NULL,
  enabled boolean NOT NULL DEFAULT true,
  default_profit_percent numeric(6,2) NOT NULL DEFAULT 25,
  minimum_profit_mnt numeric(14,2) NOT NULL DEFAULT 0,
  default_cargo_cost_mnt numeric(14,2) NOT NULL DEFAULT 0,
  default_local_delivery_cost_mnt numeric(14,2) NOT NULL DEFAULT 0,
  default_korea_domestic_shipping_krw numeric(14,2) NOT NULL DEFAULT 0,
  default_korea_domestic_shipping_mnt numeric(14,2) NOT NULL DEFAULT 0,
  payment_fee_reserve_percent numeric(6,2) NOT NULL DEFAULT 0,
  payment_fee_reserve_fixed_mnt numeric(14,2) NOT NULL DEFAULT 0,
  risk_buffer_percent numeric(6,2) NOT NULL DEFAULT 0,
  risk_buffer_fixed_mnt numeric(14,2) NOT NULL DEFAULT 0,
  rounding_rule int NOT NULL DEFAULT 1000, -- nearest N MNT
  profit_base text NOT NULL DEFAULT 'TOTAL_COST', -- SOURCE_ONLY | TOTAL_COST
  price_sync_mode price_sync_mode NOT NULL DEFAULT 'REVIEW_BEFORE_UPDATE',
  price_change_threshold_percent numeric(6,2) NOT NULL DEFAULT 5,
  price_change_threshold_mnt numeric(14,2) NOT NULL DEFAULT 5000,
  exchange_rate numeric(14,6), -- manual KRW->MNT for now
  default_delivery_min_days int NOT NULL DEFAULT 10,
  default_delivery_max_days int NOT NULL DEFAULT 14,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (merchant_id, source)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.merchant_foreign_source_settings TO authenticated;
GRANT ALL ON public.merchant_foreign_source_settings TO service_role;

ALTER TABLE public.merchant_foreign_source_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Merchant staff manage own foreign settings"
  ON public.merchant_foreign_source_settings FOR ALL
  TO authenticated
  USING (public.has_merchant_access(auth.uid(), merchant_id))
  WITH CHECK (public.has_merchant_access(auth.uid(), merchant_id));

CREATE TRIGGER trg_merchant_foreign_settings_updated_at
  BEFORE UPDATE ON public.merchant_foreign_source_settings
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- 6. source_purchase_queue ---------------------------------
CREATE TABLE IF NOT EXISTS public.source_purchase_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  order_item_index int NOT NULL,
  merchant_id uuid NOT NULL REFERENCES public.merchants(id) ON DELETE CASCADE,
  source foreign_source NOT NULL,
  source_url text,
  source_product_id text,
  source_variant_id text,
  selected_size_label text,
  source_price numeric(14,2),
  source_currency text,
  source_price_mnt numeric(14,2),
  customer_paid_price_mnt numeric(14,2),
  status foreign_fulfillment_status NOT NULL DEFAULT 'PAID',
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.source_purchase_queue TO authenticated;
GRANT ALL ON public.source_purchase_queue TO service_role;

ALTER TABLE public.source_purchase_queue ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Merchant staff manage own purchase queue"
  ON public.source_purchase_queue FOR ALL
  TO authenticated
  USING (public.has_merchant_access(auth.uid(), merchant_id))
  WITH CHECK (public.has_merchant_access(auth.uid(), merchant_id));

CREATE INDEX IF NOT EXISTS spq_merchant_status_idx ON public.source_purchase_queue(merchant_id, status);
CREATE INDEX IF NOT EXISTS spq_order_idx ON public.source_purchase_queue(order_id);

CREATE TRIGGER trg_spq_updated_at
  BEFORE UPDATE ON public.source_purchase_queue
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- 7. orders: mixed fulfillment flags -----------------------
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS has_foreign_order_items boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS has_ready_stock_items boolean NOT NULL DEFAULT true;
