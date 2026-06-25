
-- 1. orders.coupon_consumed_at
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS coupon_consumed_at timestamptz;

-- 2. legacy_stock_reservations table
CREATE TABLE IF NOT EXISTS public.legacy_stock_reservations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  merchant_id uuid NOT NULL REFERENCES public.merchants(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  variant_key text NOT NULL,
  quantity int NOT NULL CHECK (quantity > 0),
  status text NOT NULL DEFAULT 'reserved' CHECK (status IN ('reserved','confirmed','released','expired','cancelled')),
  created_at timestamptz NOT NULL DEFAULT now(),
  confirmed_at timestamptz,
  released_at timestamptz,
  release_reason text,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS legacy_stock_res_order_idx ON public.legacy_stock_reservations(order_id);
CREATE INDEX IF NOT EXISTS legacy_stock_res_status_idx ON public.legacy_stock_reservations(status);

GRANT SELECT ON public.legacy_stock_reservations TO authenticated;
GRANT ALL ON public.legacy_stock_reservations TO service_role;

ALTER TABLE public.legacy_stock_reservations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "merchant_read_own_legacy_stock_res"
  ON public.legacy_stock_reservations FOR SELECT
  TO authenticated
  USING (public.has_merchant_access(auth.uid(), merchant_id));

CREATE TRIGGER set_updated_at_legacy_stock_res
  BEFORE UPDATE ON public.legacy_stock_reservations
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- 3. reserve_legacy_stock_for_order: decrement variant_stock + log reservation atomically
CREATE OR REPLACE FUNCTION public.reserve_legacy_stock_for_order(
  _order_id uuid,
  _merchant_id uuid,
  _items jsonb
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  rec record;
  v_current int;
  insufficient jsonb := '[]'::jsonb;
BEGIN
  IF jsonb_array_length(COALESCE(_items, '[]'::jsonb)) = 0 THEN
    RETURN jsonb_build_object('ok', true, 'reserved', 0);
  END IF;

  PERFORM 1 FROM public.products
   WHERE id IN (SELECT DISTINCT (item->>'product_id')::uuid FROM jsonb_array_elements(_items) item)
   ORDER BY id FOR UPDATE;

  -- Validate
  FOR rec IN
    SELECT (item->>'product_id')::uuid AS product_id,
           NULLIF(item->>'variant_key','') AS variant_key,
           (item->>'qty')::int AS qty
      FROM jsonb_array_elements(_items) item
  LOOP
    IF rec.variant_key IS NULL THEN CONTINUE; END IF;
    SELECT CASE WHEN (variant_stock ? rec.variant_key)
                THEN (variant_stock->>rec.variant_key)::int ELSE NULL END
      INTO v_current FROM public.products WHERE id = rec.product_id;
    IF v_current IS NULL THEN CONTINUE; END IF;
    IF v_current < rec.qty THEN
      insufficient := insufficient || jsonb_build_object(
        'product_id', rec.product_id, 'variant_key', rec.variant_key,
        'remaining', v_current, 'requested', rec.qty);
    END IF;
  END LOOP;

  IF jsonb_array_length(insufficient) > 0 THEN
    RETURN jsonb_build_object('ok', false, 'insufficient', insufficient);
  END IF;

  -- Apply + log
  FOR rec IN
    SELECT (item->>'product_id')::uuid AS product_id,
           NULLIF(item->>'variant_key','') AS variant_key,
           (item->>'qty')::int AS qty
      FROM jsonb_array_elements(_items) item
  LOOP
    IF rec.variant_key IS NULL THEN CONTINUE; END IF;
    UPDATE public.products
       SET variant_stock = jsonb_set(
             COALESCE(variant_stock, '{}'::jsonb),
             ARRAY[rec.variant_key],
             to_jsonb(GREATEST(0,
               COALESCE((variant_stock->>rec.variant_key)::int, 0) - rec.qty
             ))
           ),
           updated_at = now()
     WHERE id = rec.product_id AND variant_stock ? rec.variant_key;

    INSERT INTO public.legacy_stock_reservations(
      order_id, merchant_id, product_id, variant_key, quantity, status
    ) VALUES (
      _order_id, _merchant_id, rec.product_id, rec.variant_key, rec.qty, 'reserved'
    );
  END LOOP;

  RETURN jsonb_build_object('ok', true);
END $$;

REVOKE ALL ON FUNCTION public.reserve_legacy_stock_for_order(uuid, uuid, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_legacy_stock_for_order(uuid, uuid, jsonb) TO service_role;

-- 4. confirm_legacy_stock_reservations: reserved → confirmed, idempotent
CREATE OR REPLACE FUNCTION public.confirm_legacy_stock_reservations(_order_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_count int;
BEGIN
  UPDATE public.legacy_stock_reservations
     SET status = 'confirmed', confirmed_at = now(), updated_at = now()
   WHERE order_id = _order_id AND status = 'reserved';
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN jsonb_build_object('ok', true, 'confirmed', v_count);
END $$;

REVOKE ALL ON FUNCTION public.confirm_legacy_stock_reservations(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.confirm_legacy_stock_reservations(uuid) TO service_role;

-- 5. release_legacy_stock_reservations: restore variant_stock + mark released, idempotent
CREATE OR REPLACE FUNCTION public.release_legacy_stock_reservations(
  _order_id uuid, _reason text DEFAULT 'released'
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  r record;
  v_count int := 0;
  v_status text;
BEGIN
  v_status := CASE WHEN _reason IN ('expired','cancelled') THEN _reason ELSE 'released' END;

  PERFORM 1 FROM public.products
   WHERE id IN (SELECT DISTINCT product_id FROM public.legacy_stock_reservations
                WHERE order_id = _order_id AND status = 'reserved')
   ORDER BY id FOR UPDATE;

  FOR r IN
    SELECT id, product_id, variant_key, quantity
      FROM public.legacy_stock_reservations
     WHERE order_id = _order_id AND status = 'reserved'
     FOR UPDATE
  LOOP
    UPDATE public.products
       SET variant_stock = jsonb_set(
             COALESCE(variant_stock, '{}'::jsonb),
             ARRAY[r.variant_key],
             to_jsonb(COALESCE((variant_stock->>r.variant_key)::int, 0) + r.quantity)
           ),
           updated_at = now()
     WHERE id = r.product_id AND variant_stock ? r.variant_key;

    UPDATE public.legacy_stock_reservations
       SET status = v_status, released_at = now(),
           release_reason = _reason, updated_at = now()
     WHERE id = r.id;
    v_count := v_count + 1;
  END LOOP;

  RETURN jsonb_build_object('ok', true, 'released', v_count);
END $$;

REVOKE ALL ON FUNCTION public.release_legacy_stock_reservations(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.release_legacy_stock_reservations(uuid, text) TO service_role;

-- 6. consume_coupon_for_order: idempotent per order; bumps used_count once
CREATE OR REPLACE FUNCTION public.consume_coupon_for_order(_order_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_order record;
  v_updated int;
  v_consumed boolean;
BEGIN
  SELECT id, coupon_id, coupon_consumed_at INTO v_order
    FROM public.orders WHERE id = _order_id FOR UPDATE;
  IF NOT FOUND OR v_order.coupon_id IS NULL THEN
    RETURN jsonb_build_object('ok', true, 'consumed', false, 'reason', 'no_coupon');
  END IF;
  IF v_order.coupon_consumed_at IS NOT NULL THEN
    RETURN jsonb_build_object('ok', true, 'consumed', false, 'reason', 'already');
  END IF;

  UPDATE public.coupons
     SET used_count = used_count + 1, updated_at = now()
   WHERE id = v_order.coupon_id
     AND is_active = true
     AND (expires_at IS NULL OR expires_at > now())
     AND (max_uses IS NULL OR used_count < max_uses);
  GET DIAGNOSTICS v_updated = ROW_COUNT;
  v_consumed := v_updated > 0;

  UPDATE public.orders
     SET coupon_consumed_at = now(), updated_at = now()
   WHERE id = _order_id;

  RETURN jsonb_build_object('ok', true, 'consumed', v_consumed,
    'reason', CASE WHEN v_consumed THEN 'ok' ELSE 'coupon_exhausted' END);
END $$;

REVOKE ALL ON FUNCTION public.consume_coupon_for_order(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.consume_coupon_for_order(uuid) TO service_role;

-- 7. expire_unpaid_orders: release inventory + legacy + mark order expired
CREATE OR REPLACE FUNCTION public.expire_unpaid_orders(_minutes int DEFAULT 60)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  o record;
  v_count int := 0;
BEGIN
  FOR o IN
    SELECT id FROM public.orders
     WHERE payment_status = 'unpaid'
       AND status NOT IN ('cancelled','completed','expired')
       AND created_at < now() - make_interval(mins => GREATEST(_minutes, 1))
  LOOP
    PERFORM public.release_inventory_reservations(o.id, 'expired');
    PERFORM public.release_legacy_stock_reservations(o.id, 'expired');
    UPDATE public.orders
       SET payment_status = 'expired',
           status = 'cancelled',
           updated_at = now()
     WHERE id = o.id AND payment_status = 'unpaid';
    v_count := v_count + 1;
  END LOOP;
  RETURN jsonb_build_object('ok', true, 'expired', v_count);
END $$;

REVOKE ALL ON FUNCTION public.expire_unpaid_orders(int) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.expire_unpaid_orders(int) TO service_role;
