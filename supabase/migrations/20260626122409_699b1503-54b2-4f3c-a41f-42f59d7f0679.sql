
-- 1. Shipment cost summary table
CREATE TABLE public.cargo_shipment_costs (
  merchant_id uuid NOT NULL,
  track_number text NOT NULL,
  product_purchase_total numeric NOT NULL DEFAULT 0,
  cargo_fee numeric NOT NULL DEFAULT 0,
  customs_fee numeric NOT NULL DEFAULT 0,
  local_delivery_fee numeric NOT NULL DEFAULT 0,
  other_expenses numeric NOT NULL DEFAULT 0,
  total_landed_cost numeric NOT NULL DEFAULT 0,
  allocation_method text,
  allocated_at timestamptz,
  allocated_by uuid,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (merchant_id, track_number)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.cargo_shipment_costs TO authenticated;
GRANT ALL ON public.cargo_shipment_costs TO service_role;
ALTER TABLE public.cargo_shipment_costs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "merchant access cargo_shipment_costs"
  ON public.cargo_shipment_costs FOR ALL TO authenticated
  USING (public.has_merchant_access(auth.uid(), merchant_id))
  WITH CHECK (public.has_merchant_access(auth.uid(), merchant_id));
CREATE TRIGGER tg_cargo_shipment_costs_updated_at
  BEFORE UPDATE ON public.cargo_shipment_costs
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- 2. Inventory batches
CREATE TABLE public.inventory_batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id uuid NOT NULL,
  inventory_item_id uuid NOT NULL REFERENCES public.inventory_items(id) ON DELETE CASCADE,
  product_id uuid,
  variant_id uuid,
  track_number text,
  incoming_item_id uuid,
  receipt_id uuid REFERENCES public.incoming_cargo_receipts(id) ON DELETE SET NULL,
  received_at timestamptz NOT NULL DEFAULT now(),
  quantity numeric NOT NULL,
  purchase_price numeric NOT NULL DEFAULT 0,
  cargo_cost numeric NOT NULL DEFAULT 0,
  customs_cost numeric NOT NULL DEFAULT 0,
  other_cost numeric NOT NULL DEFAULT 0,
  landed_cost numeric NOT NULL DEFAULT 0,
  allocation_method text,
  allocated_at timestamptz,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_inv_batches_merchant_track ON public.inventory_batches(merchant_id, track_number);
CREATE INDEX idx_inv_batches_item ON public.inventory_batches(inventory_item_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.inventory_batches TO authenticated;
GRANT ALL ON public.inventory_batches TO service_role;
ALTER TABLE public.inventory_batches ENABLE ROW LEVEL SECURITY;
CREATE POLICY "merchant access inventory_batches"
  ON public.inventory_batches FOR ALL TO authenticated
  USING (public.has_merchant_access(auth.uid(), merchant_id))
  WITH CHECK (public.has_merchant_access(auth.uid(), merchant_id));
CREATE TRIGGER tg_inventory_batches_updated_at
  BEFORE UPDATE ON public.inventory_batches
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- 3. Extend inventory_items with cost aggregates
ALTER TABLE public.inventory_items
  ADD COLUMN IF NOT EXISTS average_cost numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_purchase_cost numeric,
  ADD COLUMN IF NOT EXISTS highest_cost numeric,
  ADD COLUMN IF NOT EXISTS lowest_cost numeric,
  ADD COLUMN IF NOT EXISTS total_cargo_cost numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS average_cargo_cost numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS landed_cost_avg numeric NOT NULL DEFAULT 0;

-- 4. Recompute aggregates from batches
CREATE OR REPLACE FUNCTION public.recompute_inventory_item_costs(_inventory_item_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_total_qty numeric := 0;
  v_total_value numeric := 0;
  v_total_landed numeric := 0;
  v_total_cargo numeric := 0;
  v_last numeric;
  v_high numeric;
  v_low numeric;
BEGIN
  SELECT
    COALESCE(SUM(quantity),0),
    COALESCE(SUM(quantity * purchase_price),0),
    COALESCE(SUM(quantity * landed_cost),0),
    COALESCE(SUM(quantity * cargo_cost),0),
    MAX(purchase_price),
    MIN(NULLIF(purchase_price,0))
  INTO v_total_qty, v_total_value, v_total_landed, v_total_cargo, v_high, v_low
  FROM public.inventory_batches WHERE inventory_item_id = _inventory_item_id;

  SELECT purchase_price INTO v_last FROM public.inventory_batches
    WHERE inventory_item_id = _inventory_item_id
    ORDER BY received_at DESC LIMIT 1;

  UPDATE public.inventory_items SET
    average_cost = CASE WHEN v_total_qty > 0 THEN v_total_value / v_total_qty ELSE 0 END,
    landed_cost_avg = CASE WHEN v_total_qty > 0 THEN v_total_landed / v_total_qty ELSE 0 END,
    total_cargo_cost = v_total_cargo,
    average_cargo_cost = CASE WHEN v_total_qty > 0 THEN v_total_cargo / v_total_qty ELSE 0 END,
    last_purchase_cost = v_last,
    highest_cost = v_high,
    lowest_cost = v_low,
    updated_at = now()
  WHERE id = _inventory_item_id;
END;
$$;

-- 5. Trigger: receipt -> batch
CREATE OR REPLACE FUNCTION public.tg_create_inventory_batch_from_receipt()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_price numeric;
BEGIN
  IF NEW.received_quantity IS NULL OR NEW.received_quantity <= 0 OR NEW.inventory_item_id IS NULL THEN
    RETURN NEW;
  END IF;
  v_price := COALESCE(NEW.unit_cost, 0);
  INSERT INTO public.inventory_batches(
    merchant_id, inventory_item_id, product_id, variant_id, track_number,
    incoming_item_id, receipt_id, received_at, quantity, purchase_price,
    landed_cost, created_by
  ) VALUES (
    NEW.merchant_id, NEW.inventory_item_id, NEW.product_id, NEW.variant_id, NEW.track_number,
    NEW.incoming_item_id, NEW.id, NEW.created_at, NEW.received_quantity, v_price,
    v_price, NEW.received_by
  );
  PERFORM public.recompute_inventory_item_costs(NEW.inventory_item_id);
  RETURN NEW;
END;
$$;

CREATE TRIGGER tg_incoming_receipt_create_batch
AFTER INSERT ON public.incoming_cargo_receipts
FOR EACH ROW EXECUTE FUNCTION public.tg_create_inventory_batch_from_receipt();

-- 6. Allocate cargo costs (quantity / value / manual)
CREATE OR REPLACE FUNCTION public.allocate_cargo_costs(
  _merchant_id uuid,
  _track_number text,
  _method text,
  _cargo_fee numeric,
  _customs_fee numeric,
  _other_expenses numeric,
  _local_delivery_fee numeric,
  _manual jsonb,
  _allocated_by uuid
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_total_qty numeric := 0;
  v_total_value numeric := 0;
  v_batches_count int := 0;
  v_total_expense numeric;
  v_inv_ids uuid[] := ARRAY[]::uuid[];
  v_id uuid;
  b record;
  share numeric;
  alloc_cargo numeric;
  alloc_customs numeric;
  alloc_other numeric;
  m_cargo numeric;
  m_customs numeric;
  m_other numeric;
BEGIN
  IF _method NOT IN ('quantity','value','manual') THEN
    RAISE EXCEPTION 'invalid_method:%', _method;
  END IF;

  SELECT COALESCE(SUM(quantity),0),
         COALESCE(SUM(quantity * purchase_price),0),
         COUNT(*)
    INTO v_total_qty, v_total_value, v_batches_count
    FROM public.inventory_batches
   WHERE merchant_id = _merchant_id AND track_number = _track_number;

  v_total_expense := COALESCE(_cargo_fee,0) + COALESCE(_customs_fee,0)
                   + COALESCE(_other_expenses,0) + COALESCE(_local_delivery_fee,0);

  IF v_batches_count > 0 THEN
    FOR b IN
      SELECT * FROM public.inventory_batches
       WHERE merchant_id = _merchant_id AND track_number = _track_number
       ORDER BY id
       FOR UPDATE
    LOOP
      alloc_cargo := 0; alloc_customs := 0; alloc_other := 0;

      IF _method = 'quantity' THEN
        share := CASE WHEN v_total_qty > 0 THEN b.quantity / v_total_qty ELSE 0 END;
        alloc_cargo   := (COALESCE(_cargo_fee,0) * share) / NULLIF(b.quantity,0);
        alloc_customs := (COALESCE(_customs_fee,0) * share) / NULLIF(b.quantity,0);
        alloc_other   := ((COALESCE(_other_expenses,0)+COALESCE(_local_delivery_fee,0)) * share) / NULLIF(b.quantity,0);

      ELSIF _method = 'value' THEN
        share := CASE
          WHEN v_total_value > 0 THEN (b.quantity * b.purchase_price) / v_total_value
          WHEN v_total_qty   > 0 THEN b.quantity / v_total_qty
          ELSE 0 END;
        alloc_cargo   := (COALESCE(_cargo_fee,0) * share) / NULLIF(b.quantity,0);
        alloc_customs := (COALESCE(_customs_fee,0) * share) / NULLIF(b.quantity,0);
        alloc_other   := ((COALESCE(_other_expenses,0)+COALESCE(_local_delivery_fee,0)) * share) / NULLIF(b.quantity,0);

      ELSE -- manual
        m_cargo := 0; m_customs := 0; m_other := 0;
        SELECT COALESCE((m->>'cargo_cost')::numeric,0),
               COALESCE((m->>'customs_cost')::numeric,0),
               COALESCE((m->>'other_cost')::numeric,0)
          INTO m_cargo, m_customs, m_other
          FROM jsonb_array_elements(COALESCE(_manual,'[]'::jsonb)) m
         WHERE (m->>'batch_id')::uuid = b.id
         LIMIT 1;
        alloc_cargo   := m_cargo   / NULLIF(b.quantity,0);
        alloc_customs := m_customs / NULLIF(b.quantity,0);
        alloc_other   := m_other   / NULLIF(b.quantity,0);
      END IF;

      UPDATE public.inventory_batches SET
        cargo_cost   = COALESCE(alloc_cargo,0),
        customs_cost = COALESCE(alloc_customs,0),
        other_cost   = COALESCE(alloc_other,0),
        landed_cost  = b.purchase_price + COALESCE(alloc_cargo,0) + COALESCE(alloc_customs,0) + COALESCE(alloc_other,0),
        allocation_method = _method,
        allocated_at = now(),
        updated_at = now()
       WHERE id = b.id;

      v_inv_ids := array_append(v_inv_ids, b.inventory_item_id);
    END LOOP;

    FOREACH v_id IN ARRAY (SELECT ARRAY(SELECT DISTINCT unnest(v_inv_ids))) LOOP
      PERFORM public.recompute_inventory_item_costs(v_id);
    END LOOP;
  END IF;

  INSERT INTO public.cargo_shipment_costs(
    merchant_id, track_number, product_purchase_total, cargo_fee, customs_fee,
    local_delivery_fee, other_expenses, total_landed_cost, allocation_method,
    allocated_at, allocated_by
  ) VALUES (
    _merchant_id, _track_number, v_total_value, COALESCE(_cargo_fee,0), COALESCE(_customs_fee,0),
    COALESCE(_local_delivery_fee,0), COALESCE(_other_expenses,0),
    v_total_value + v_total_expense, _method, now(), _allocated_by
  ) ON CONFLICT (merchant_id, track_number) DO UPDATE SET
    product_purchase_total = EXCLUDED.product_purchase_total,
    cargo_fee = EXCLUDED.cargo_fee,
    customs_fee = EXCLUDED.customs_fee,
    local_delivery_fee = EXCLUDED.local_delivery_fee,
    other_expenses = EXCLUDED.other_expenses,
    total_landed_cost = EXCLUDED.total_landed_cost,
    allocation_method = EXCLUDED.allocation_method,
    allocated_at = EXCLUDED.allocated_at,
    allocated_by = EXCLUDED.allocated_by,
    updated_at = now();

  RETURN jsonb_build_object(
    'ok', true,
    'batches', v_batches_count,
    'purchase_total', v_total_value,
    'total_landed', v_total_value + v_total_expense
  );
END;
$$;

-- 7. Save shipment cost summary without allocating
CREATE OR REPLACE FUNCTION public.upsert_shipment_costs(
  _merchant_id uuid,
  _track_number text,
  _cargo_fee numeric,
  _customs_fee numeric,
  _local_delivery_fee numeric,
  _other_expenses numeric,
  _notes text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_purchase numeric;
BEGIN
  SELECT COALESCE(SUM(quantity*purchase_price),0) INTO v_purchase
    FROM public.inventory_batches
   WHERE merchant_id = _merchant_id AND track_number = _track_number;

  INSERT INTO public.cargo_shipment_costs(
    merchant_id, track_number, product_purchase_total, cargo_fee, customs_fee,
    local_delivery_fee, other_expenses, total_landed_cost, notes
  ) VALUES (
    _merchant_id, _track_number, v_purchase,
    COALESCE(_cargo_fee,0), COALESCE(_customs_fee,0),
    COALESCE(_local_delivery_fee,0), COALESCE(_other_expenses,0),
    v_purchase + COALESCE(_cargo_fee,0)+COALESCE(_customs_fee,0)
              + COALESCE(_local_delivery_fee,0)+COALESCE(_other_expenses,0),
    NULLIF(_notes,'')
  ) ON CONFLICT (merchant_id, track_number) DO UPDATE SET
    product_purchase_total = EXCLUDED.product_purchase_total,
    cargo_fee = EXCLUDED.cargo_fee,
    customs_fee = EXCLUDED.customs_fee,
    local_delivery_fee = EXCLUDED.local_delivery_fee,
    other_expenses = EXCLUDED.other_expenses,
    total_landed_cost = EXCLUDED.total_landed_cost,
    notes = COALESCE(EXCLUDED.notes, public.cargo_shipment_costs.notes),
    updated_at = now();

  RETURN jsonb_build_object('ok', true, 'purchase_total', v_purchase);
END;
$$;
