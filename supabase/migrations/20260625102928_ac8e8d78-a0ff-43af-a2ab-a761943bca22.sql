
CREATE TABLE IF NOT EXISTS public.inventory_reservations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  order_item_index integer,
  merchant_id uuid NOT NULL REFERENCES public.merchants(id) ON DELETE CASCADE,
  inventory_item_id uuid NOT NULL REFERENCES public.inventory_items(id) ON DELETE RESTRICT,
  product_id uuid REFERENCES public.products(id) ON DELETE SET NULL,
  variant_id uuid REFERENCES public.product_variants(id) ON DELETE SET NULL,
  link_id uuid REFERENCES public.inventory_product_links(id) ON DELETE SET NULL,
  quantity numeric NOT NULL CHECK (quantity > 0),
  status text NOT NULL DEFAULT 'reserved'
    CHECK (status IN ('reserved','confirmed','released','expired','cancelled')),
  expires_at timestamptz,
  confirmed_at timestamptz,
  released_at timestamptz,
  release_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.inventory_reservations TO authenticated;
GRANT ALL ON public.inventory_reservations TO service_role;

ALTER TABLE public.inventory_reservations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "merchant_read_reservations" ON public.inventory_reservations
  FOR SELECT TO authenticated
  USING (public.has_merchant_access(auth.uid(), merchant_id));

CREATE POLICY "service_role_all_reservations" ON public.inventory_reservations
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_inv_res_order ON public.inventory_reservations(order_id);
CREATE INDEX IF NOT EXISTS idx_inv_res_item ON public.inventory_reservations(inventory_item_id);
CREATE INDEX IF NOT EXISTS idx_inv_res_merchant ON public.inventory_reservations(merchant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_inv_res_expire
  ON public.inventory_reservations(expires_at)
  WHERE status = 'reserved' AND expires_at IS NOT NULL;

CREATE TRIGGER trg_inv_res_updated_at
  BEFORE UPDATE ON public.inventory_reservations
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ─────────────────────────────────────────────────────────────────
-- RPC: reserve inventory for an order
-- _items jsonb array: [{inventory_item_id, product_id, variant_id, link_id, quantity, order_item_index}]
-- ─────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.reserve_inventory_for_order(
  _order_id uuid,
  _merchant_id uuid,
  _items jsonb,
  _expires_minutes int DEFAULT 30
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  rec record;
  v_item public.inventory_items%ROWTYPE;
  v_avail numeric;
  v_expires timestamptz := now() + make_interval(mins => GREATEST(_expires_minutes, 1));
  insufficient jsonb := '[]'::jsonb;
  v_before numeric;
  v_after numeric;
  v_res_id uuid;
BEGIN
  -- Lock all involved inventory items deterministically to avoid deadlocks.
  PERFORM 1
    FROM public.inventory_items
   WHERE id IN (
     SELECT DISTINCT (item->>'inventory_item_id')::uuid
       FROM jsonb_array_elements(_items) item
   )
   ORDER BY id
   FOR UPDATE;

  -- Phase 1: validate
  FOR rec IN
    SELECT (item->>'inventory_item_id')::uuid AS inventory_item_id,
           (item->>'quantity')::numeric        AS quantity
      FROM jsonb_array_elements(_items) item
  LOOP
    SELECT * INTO v_item FROM public.inventory_items WHERE id = rec.inventory_item_id;
    IF NOT FOUND OR v_item.merchant_id <> _merchant_id THEN
      RETURN jsonb_build_object('ok', false, 'error', 'inventory_not_found');
    END IF;
    v_avail := GREATEST(0, COALESCE(v_item.quantity_on_hand,0) - COALESCE(v_item.quantity_reserved,0));
    IF v_avail < rec.quantity THEN
      insufficient := insufficient || jsonb_build_object(
        'inventory_item_id', rec.inventory_item_id,
        'inventory_name', v_item.name,
        'available', v_avail,
        'requested', rec.quantity
      );
    END IF;
  END LOOP;

  IF jsonb_array_length(insufficient) > 0 THEN
    RETURN jsonb_build_object('ok', false, 'insufficient', insufficient);
  END IF;

  -- Phase 2: apply
  FOR rec IN
    SELECT (item->>'inventory_item_id')::uuid AS inventory_item_id,
           NULLIF(item->>'product_id','')::uuid AS product_id,
           NULLIF(item->>'variant_id','')::uuid AS variant_id,
           NULLIF(item->>'link_id','')::uuid    AS link_id,
           (item->>'quantity')::numeric        AS quantity,
           NULLIF(item->>'order_item_index','')::int AS order_item_index
      FROM jsonb_array_elements(_items) item
  LOOP
    SELECT quantity_reserved INTO v_before FROM public.inventory_items WHERE id = rec.inventory_item_id;
    v_after := COALESCE(v_before,0) + rec.quantity;

    UPDATE public.inventory_items
       SET quantity_reserved = v_after,
           updated_at = now()
     WHERE id = rec.inventory_item_id;

    INSERT INTO public.inventory_reservations(
      order_id, order_item_index, merchant_id, inventory_item_id,
      product_id, variant_id, link_id, quantity, status, expires_at
    ) VALUES (
      _order_id, rec.order_item_index, _merchant_id, rec.inventory_item_id,
      rec.product_id, rec.variant_id, rec.link_id, rec.quantity, 'reserved', v_expires
    ) RETURNING id INTO v_res_id;

    INSERT INTO public.inventory_movements(
      merchant_id, inventory_item_id, movement_type, quantity,
      before_quantity, after_quantity, source_type, source_reference, note
    ) VALUES (
      _merchant_id, rec.inventory_item_id, 'reserved', rec.quantity,
      v_before, v_after, 'order', _order_id::text,
      'reservation:' || v_res_id::text
    );
  END LOOP;

  RETURN jsonb_build_object('ok', true, 'expires_at', v_expires);
END;
$$;

-- ─────────────────────────────────────────────────────────────────
-- RPC: confirm reservations for a paid order (idempotent)
-- ─────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.confirm_inventory_reservations(_order_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r record;
  v_before_reserved numeric;
  v_before_on_hand numeric;
  v_after_reserved numeric;
  v_after_on_hand numeric;
  v_count int := 0;
BEGIN
  PERFORM 1
    FROM public.inventory_items
   WHERE id IN (
     SELECT DISTINCT inventory_item_id FROM public.inventory_reservations
      WHERE order_id = _order_id AND status = 'reserved'
   )
   ORDER BY id
   FOR UPDATE;

  FOR r IN
    SELECT id, inventory_item_id, merchant_id, quantity
      FROM public.inventory_reservations
     WHERE order_id = _order_id AND status = 'reserved'
     FOR UPDATE
  LOOP
    SELECT quantity_reserved, quantity_on_hand
      INTO v_before_reserved, v_before_on_hand
      FROM public.inventory_items WHERE id = r.inventory_item_id;

    v_after_reserved := GREATEST(0, COALESCE(v_before_reserved,0) - r.quantity);
    v_after_on_hand  := GREATEST(0, COALESCE(v_before_on_hand,0) - r.quantity);

    UPDATE public.inventory_items
       SET quantity_reserved = v_after_reserved,
           quantity_on_hand  = v_after_on_hand,
           updated_at = now()
     WHERE id = r.inventory_item_id;

    UPDATE public.inventory_reservations
       SET status = 'confirmed', confirmed_at = now(), updated_at = now()
     WHERE id = r.id;

    INSERT INTO public.inventory_movements(
      merchant_id, inventory_item_id, movement_type, quantity,
      before_quantity, after_quantity, source_type, source_reference, note
    ) VALUES (
      r.merchant_id, r.inventory_item_id, 'sold', r.quantity,
      v_before_on_hand, v_after_on_hand, 'order', _order_id::text,
      'reservation:' || r.id::text
    );

    v_count := v_count + 1;
  END LOOP;

  RETURN jsonb_build_object('ok', true, 'confirmed', v_count);
END;
$$;

-- ─────────────────────────────────────────────────────────────────
-- RPC: release reservations for an order (idempotent)
--   _reason in ('released','expired','cancelled') — default 'released'
-- ─────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.release_inventory_reservations(
  _order_id uuid,
  _reason text DEFAULT 'released'
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r record;
  v_before numeric;
  v_after numeric;
  v_count int := 0;
  v_status text;
BEGIN
  v_status := CASE WHEN _reason IN ('expired','cancelled') THEN _reason ELSE 'released' END;

  PERFORM 1
    FROM public.inventory_items
   WHERE id IN (
     SELECT DISTINCT inventory_item_id FROM public.inventory_reservations
      WHERE order_id = _order_id AND status = 'reserved'
   )
   ORDER BY id
   FOR UPDATE;

  FOR r IN
    SELECT id, inventory_item_id, merchant_id, quantity
      FROM public.inventory_reservations
     WHERE order_id = _order_id AND status = 'reserved'
     FOR UPDATE
  LOOP
    SELECT quantity_reserved INTO v_before FROM public.inventory_items WHERE id = r.inventory_item_id;
    v_after := GREATEST(0, COALESCE(v_before,0) - r.quantity);

    UPDATE public.inventory_items
       SET quantity_reserved = v_after, updated_at = now()
     WHERE id = r.inventory_item_id;

    UPDATE public.inventory_reservations
       SET status = v_status,
           released_at = now(),
           release_reason = _reason,
           updated_at = now()
     WHERE id = r.id;

    INSERT INTO public.inventory_movements(
      merchant_id, inventory_item_id, movement_type, quantity,
      before_quantity, after_quantity, source_type, source_reference, note
    ) VALUES (
      r.merchant_id, r.inventory_item_id, 'released', r.quantity,
      v_before, v_after, 'order', _order_id::text,
      'reservation:' || r.id::text || ' reason:' || _reason
    );

    v_count := v_count + 1;
  END LOOP;

  RETURN jsonb_build_object('ok', true, 'released', v_count, 'status', v_status);
END;
$$;

-- ─────────────────────────────────────────────────────────────────
-- RPC: expire all reservations past expires_at for unpaid orders
-- ─────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.expire_inventory_reservations()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  o record;
  v_total int := 0;
  v_res jsonb;
BEGIN
  FOR o IN
    SELECT DISTINCT r.order_id
      FROM public.inventory_reservations r
      JOIN public.orders ord ON ord.id = r.order_id
     WHERE r.status = 'reserved'
       AND r.expires_at IS NOT NULL
       AND r.expires_at < now()
       AND ord.payment_status <> 'confirmed'
  LOOP
    v_res := public.release_inventory_reservations(o.order_id, 'expired');
    v_total := v_total + COALESCE((v_res->>'released')::int, 0);
  END LOOP;

  RETURN jsonb_build_object('ok', true, 'expired', v_total);
END;
$$;
