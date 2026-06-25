
CREATE TABLE IF NOT EXISTS public.inventory_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id uuid NOT NULL REFERENCES public.merchants(id) ON DELETE CASCADE,
  store_id uuid NULL,
  name text NOT NULL,
  sku text NULL,
  barcode text NULL,
  description text NULL,
  quantity_on_hand numeric NOT NULL DEFAULT 0,
  quantity_reserved numeric NOT NULL DEFAULT 0,
  quantity_available numeric GENERATED ALWAYS AS (quantity_on_hand - quantity_reserved) STORED,
  unit text NOT NULL DEFAULT 'pcs',
  cost_price numeric NULL,
  currency text NOT NULL DEFAULT 'MNT',
  source_type text NULL,
  source_cargo_tracking_number text NULL,
  source_cargo_id text NULL,
  warehouse_location text NULL,
  status text NOT NULL DEFAULT 'active',
  created_by uuid NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_inventory_items_merchant ON public.inventory_items(merchant_id);
CREATE INDEX IF NOT EXISTS idx_inventory_items_cargo ON public.inventory_items(merchant_id, source_cargo_tracking_number);
CREATE INDEX IF NOT EXISTS idx_inventory_items_sku ON public.inventory_items(merchant_id, sku);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.inventory_items TO authenticated;
GRANT ALL ON public.inventory_items TO service_role;

ALTER TABLE public.inventory_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Merchant staff can view own inventory items"
  ON public.inventory_items FOR SELECT TO authenticated
  USING (public.has_merchant_access(auth.uid(), merchant_id));

CREATE POLICY "Merchant staff can insert own inventory items"
  ON public.inventory_items FOR INSERT TO authenticated
  WITH CHECK (public.has_merchant_access(auth.uid(), merchant_id));

CREATE POLICY "Merchant staff can update own inventory items"
  ON public.inventory_items FOR UPDATE TO authenticated
  USING (public.has_merchant_access(auth.uid(), merchant_id))
  WITH CHECK (public.has_merchant_access(auth.uid(), merchant_id));

CREATE POLICY "Merchant staff can delete own inventory items"
  ON public.inventory_items FOR DELETE TO authenticated
  USING (public.has_merchant_access(auth.uid(), merchant_id));

CREATE TRIGGER trg_inventory_items_updated_at
  BEFORE UPDATE ON public.inventory_items
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

CREATE TABLE IF NOT EXISTS public.inventory_movements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id uuid NOT NULL REFERENCES public.merchants(id) ON DELETE CASCADE,
  store_id uuid NULL,
  inventory_item_id uuid NOT NULL REFERENCES public.inventory_items(id) ON DELETE CASCADE,
  movement_type text NOT NULL CHECK (movement_type IN ('cargo_received','manual_adjustment','correction','reserved','released','sold','returned')),
  quantity numeric NOT NULL,
  before_quantity numeric NOT NULL,
  after_quantity numeric NOT NULL,
  source_type text NULL,
  source_reference text NULL,
  note text NULL,
  created_by uuid NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_inv_mov_merchant ON public.inventory_movements(merchant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_inv_mov_item ON public.inventory_movements(inventory_item_id, created_at DESC);

GRANT SELECT, INSERT ON public.inventory_movements TO authenticated;
GRANT ALL ON public.inventory_movements TO service_role;

ALTER TABLE public.inventory_movements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Merchant staff can view own inventory movements"
  ON public.inventory_movements FOR SELECT TO authenticated
  USING (public.has_merchant_access(auth.uid(), merchant_id));

CREATE POLICY "Merchant staff can insert own inventory movements"
  ON public.inventory_movements FOR INSERT TO authenticated
  WITH CHECK (public.has_merchant_access(auth.uid(), merchant_id));
