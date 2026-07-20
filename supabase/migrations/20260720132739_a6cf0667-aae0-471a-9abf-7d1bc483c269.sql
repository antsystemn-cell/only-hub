
-- 1) Idempotency registry
CREATE TABLE IF NOT EXISTS public.cargo_receive_requests (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  merchant_id UUID NOT NULL,
  request_id UUID NOT NULL,
  track_number TEXT NOT NULL,
  received_by UUID,
  result_json JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (merchant_id, request_id)
);
GRANT SELECT ON public.cargo_receive_requests TO authenticated;
GRANT ALL ON public.cargo_receive_requests TO service_role;
ALTER TABLE public.cargo_receive_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "receive_requests_read_by_merchant"
  ON public.cargo_receive_requests FOR SELECT
  TO authenticated
  USING (public.has_merchant_access(auth.uid(), merchant_id));

-- 2) Append-only audit log
CREATE TABLE IF NOT EXISTS public.cargo_receive_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  merchant_id UUID NOT NULL,
  track_number TEXT,
  request_id UUID,
  action TEXT NOT NULL,
  actor_id UUID,
  before_values JSONB,
  after_values JSONB,
  meta JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS cargo_receive_logs_merchant_created_idx
  ON public.cargo_receive_logs (merchant_id, created_at DESC);
GRANT SELECT ON public.cargo_receive_logs TO authenticated;
GRANT ALL ON public.cargo_receive_logs TO service_role;
ALTER TABLE public.cargo_receive_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "receive_logs_read_by_merchant"
  ON public.cargo_receive_logs FOR SELECT
  TO authenticated
  USING (public.has_merchant_access(auth.uid(), merchant_id));
-- Append-only: no INSERT/UPDATE/DELETE policies for authenticated. Writes go
-- through SECURITY DEFINER RPCs only.

-- 3) Delete protection on incoming items with receipts
CREATE OR REPLACE FUNCTION public.tg_protect_incoming_cargo_item_delete()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.incoming_cargo_receipts WHERE incoming_item_id = OLD.id) THEN
    RAISE EXCEPTION 'incoming_item_has_receipts'
      USING HINT = 'Cancel the item instead of deleting it';
  END IF;
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_protect_incoming_cargo_item_delete ON public.incoming_cargo_items;
CREATE TRIGGER trg_protect_incoming_cargo_item_delete
  BEFORE DELETE ON public.incoming_cargo_items
  FOR EACH ROW EXECUTE FUNCTION public.tg_protect_incoming_cargo_item_delete();

-- Add cancellation metadata columns (safe if re-run)
ALTER TABLE public.incoming_cargo_items
  ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS cancelled_by UUID,
  ADD COLUMN IF NOT EXISTS cancel_reason TEXT;

-- Safe cancel RPC (soft-cancel if receipts exist, else allow hard delete via caller)
CREATE OR REPLACE FUNCTION public.cancel_incoming_cargo_item(
  _merchant_id UUID,
  _item_id UUID,
  _reason TEXT,
  _actor UUID
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_item public.incoming_cargo_items%ROWTYPE;
  v_has_receipts BOOLEAN;
BEGIN
  SELECT * INTO v_item FROM public.incoming_cargo_items
    WHERE id = _item_id AND merchant_id = _merchant_id
    FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'incoming_item_not_found';
  END IF;
  IF v_item.status = 'cancelled' THEN
    RETURN jsonb_build_object('ok', true, 'status', 'cancelled', 'already', true);
  END IF;

  SELECT EXISTS(SELECT 1 FROM public.incoming_cargo_receipts WHERE incoming_item_id = _item_id)
    INTO v_has_receipts;

  UPDATE public.incoming_cargo_items
     SET status = 'cancelled',
         cancelled_at = now(),
         cancelled_by = _actor,
         cancel_reason = NULLIF(_reason,''),
         updated_at = now()
   WHERE id = _item_id;

  INSERT INTO public.cargo_receive_logs(
    merchant_id, track_number, action, actor_id, before_values, after_values, meta
  ) VALUES (
    _merchant_id, v_item.track_number, 'cancel_incoming_item', _actor,
    to_jsonb(v_item),
    jsonb_build_object('status','cancelled','reason', _reason),
    jsonb_build_object('had_receipts', v_has_receipts)
  );

  RETURN jsonb_build_object('ok', true, 'status', 'cancelled', 'had_receipts', v_has_receipts);
END;
$$;

REVOKE ALL ON FUNCTION public.cancel_incoming_cargo_item(UUID,UUID,TEXT,UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cancel_incoming_cargo_item(UUID,UUID,TEXT,UUID) TO authenticated;

-- 4) Atomic receive v2 with idempotency + row locking + typed errors
CREATE OR REPLACE FUNCTION public.receive_incoming_cargo_items_v2(
  _merchant_id UUID,
  _track_number TEXT,
  _received_by UUID,
  _items JSONB,
  _request_id UUID
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_prev JSONB;
  v_existing_id UUID;
  it JSONB;
  v_item public.incoming_cargo_items%ROWTYPE;
  v_variant_count INT;
  v_splits JSONB;
  v_split JSONB;
  v_recv NUMERIC;
  v_dmg NUMERIC;
  v_unit_cost NUMERIC;
  v_notes TEXT;
  v_variant_id UUID;
  v_allow_extra BOOLEAN;
  v_planned NUMERIC;
  v_already NUMERIC;
  v_remaining NUMERIC;
  v_total_split NUMERIC;
  v_first_qty NUMERIC;
  v_new_id UUID;
  v_plan JSONB := '[]'::jsonb;
  v_result JSONB;
  v_before JSONB;
BEGIN
  IF _request_id IS NULL THEN
    RAISE EXCEPTION 'missing_request_id';
  END IF;

  -- 1) Idempotency check
  SELECT id, result_json INTO v_existing_id, v_prev
    FROM public.cargo_receive_requests
   WHERE merchant_id = _merchant_id AND request_id = _request_id;
  IF FOUND THEN
    RETURN v_prev || jsonb_build_object('idempotent_replay', true);
  END IF;

  -- 2) Lock all incoming rows referenced (deterministic order)
  PERFORM 1
    FROM public.incoming_cargo_items
   WHERE merchant_id = _merchant_id
     AND id IN (
       SELECT (i->>'incoming_item_id')::uuid
         FROM jsonb_array_elements(_items) i
     )
   ORDER BY id
   FOR UPDATE;

  -- 3) Validate + build plan
  FOR it IN SELECT * FROM jsonb_array_elements(_items)
  LOOP
    SELECT * INTO v_item FROM public.incoming_cargo_items
      WHERE id = (it->>'incoming_item_id')::uuid;
    IF NOT FOUND THEN RAISE EXCEPTION 'incoming_item_not_found'; END IF;
    IF v_item.merchant_id <> _merchant_id THEN RAISE EXCEPTION 'merchant_not_allowed'; END IF;
    IF v_item.track_number <> _track_number THEN RAISE EXCEPTION 'shipment_mismatch'; END IF;
    IF v_item.status = 'cancelled' THEN RAISE EXCEPTION 'item_cancelled'; END IF;

    v_planned := COALESCE(v_item.planned_quantity, 0);
    v_already := COALESCE(v_item.received_quantity,0) + COALESCE(v_item.damaged_quantity,0);
    v_remaining := GREATEST(0, v_planned - v_already);

    v_variant_count := 0;
    IF v_item.product_id IS NOT NULL THEN
      SELECT count(*) INTO v_variant_count FROM public.product_variants
        WHERE product_id = v_item.product_id;
    END IF;

    v_allow_extra := COALESCE((it->>'allow_extra')::boolean, false);
    v_splits := it->'splits';

    IF v_splits IS NOT NULL AND jsonb_typeof(v_splits) = 'array' AND jsonb_array_length(v_splits) > 0 THEN
      v_total_split := 0;
      FOR v_split IN SELECT * FROM jsonb_array_elements(v_splits) LOOP
        v_total_split := v_total_split
          + COALESCE((v_split->>'received_quantity')::numeric,0)
          + COALESCE((v_split->>'damaged_quantity')::numeric,0);
        IF COALESCE((v_split->>'received_quantity')::numeric,0) < 0
           OR COALESCE((v_split->>'damaged_quantity')::numeric,0) < 0 THEN
          RAISE EXCEPTION 'invalid_quantity';
        END IF;
        IF v_variant_count > 0 THEN
          v_variant_id := NULLIF(v_split->>'variant_id','')::uuid;
          IF v_variant_id IS NULL THEN RAISE EXCEPTION 'variant_required'; END IF;
          IF NOT EXISTS (SELECT 1 FROM public.product_variants
                          WHERE id = v_variant_id AND product_id = v_item.product_id) THEN
            RAISE EXCEPTION 'invalid_variant';
          END IF;
        END IF;
      END LOOP;
      IF NOT v_allow_extra AND v_total_split > v_remaining THEN
        RAISE EXCEPTION 'qty_exceeded';
      END IF;

      -- First split reuses base row
      v_split := v_splits->0;
      v_recv := COALESCE((v_split->>'received_quantity')::numeric,0);
      v_dmg  := COALESCE((v_split->>'damaged_quantity')::numeric,0);
      v_first_qty := v_recv + v_dmg;
      v_unit_cost := NULLIF(v_split->>'unit_cost','')::numeric;
      v_notes := NULLIF(v_split->>'notes','');

      UPDATE public.incoming_cargo_items
         SET variant_id = COALESCE(NULLIF(v_split->>'variant_id','')::uuid, variant_id),
             planned_quantity = GREATEST(v_already + v_first_qty, 0),
             updated_at = now()
       WHERE id = v_item.id;

      v_plan := v_plan || jsonb_build_object(
        'incoming_item_id', v_item.id,
        'received_quantity', v_recv,
        'damaged_quantity', v_dmg,
        'unit_cost', v_unit_cost,
        'notes', v_notes
      );

      -- Remaining splits: create sibling rows
      FOR i IN 1 .. jsonb_array_length(v_splits) - 1 LOOP
        v_split := v_splits->i;
        v_recv := COALESCE((v_split->>'received_quantity')::numeric,0);
        v_dmg  := COALESCE((v_split->>'damaged_quantity')::numeric,0);
        v_unit_cost := NULLIF(v_split->>'unit_cost','')::numeric;
        v_notes := NULLIF(v_split->>'notes','');
        INSERT INTO public.incoming_cargo_items(
          merchant_id, track_number, product_id, variant_id,
          planned_product_name, planned_quantity, planned_unit_cost, notes,
          status, created_by
        ) VALUES (
          _merchant_id, v_item.track_number, v_item.product_id,
          NULLIF(v_split->>'variant_id','')::uuid,
          v_item.planned_product_name, v_recv + v_dmg,
          COALESCE(v_unit_cost, v_item.planned_unit_cost),
          v_notes, 'ready_to_receive', _received_by
        ) RETURNING id INTO v_new_id;
        v_plan := v_plan || jsonb_build_object(
          'incoming_item_id', v_new_id,
          'received_quantity', v_recv,
          'damaged_quantity', v_dmg,
          'unit_cost', v_unit_cost,
          'notes', v_notes
        );
      END LOOP;
    ELSE
      v_recv := COALESCE((it->>'received_quantity')::numeric,0);
      v_dmg  := COALESCE((it->>'damaged_quantity')::numeric,0);
      IF v_recv < 0 OR v_dmg < 0 THEN RAISE EXCEPTION 'invalid_quantity'; END IF;
      IF v_recv = 0 AND v_dmg = 0 THEN CONTINUE; END IF;

      IF v_variant_count > 0 THEN
        v_variant_id := COALESCE(NULLIF(it->>'variant_id','')::uuid, v_item.variant_id);
        IF v_variant_id IS NULL THEN RAISE EXCEPTION 'variant_required'; END IF;
        IF NOT EXISTS (SELECT 1 FROM public.product_variants
                        WHERE id = v_variant_id AND product_id = v_item.product_id) THEN
          RAISE EXCEPTION 'invalid_variant';
        END IF;
        IF v_variant_id IS DISTINCT FROM v_item.variant_id THEN
          UPDATE public.incoming_cargo_items SET variant_id = v_variant_id, updated_at = now()
           WHERE id = v_item.id;
        END IF;
      END IF;
      IF NOT v_allow_extra AND (v_recv + v_dmg) > v_remaining THEN
        RAISE EXCEPTION 'qty_exceeded';
      END IF;

      v_unit_cost := NULLIF(it->>'unit_cost','')::numeric;
      IF v_unit_cost IS NOT NULL AND v_unit_cost < 0 THEN RAISE EXCEPTION 'invalid_unit_cost'; END IF;

      v_plan := v_plan || jsonb_build_object(
        'incoming_item_id', v_item.id,
        'received_quantity', v_recv,
        'damaged_quantity', v_dmg,
        'unit_cost', v_unit_cost,
        'notes', NULLIF(it->>'notes','')
      );
    END IF;
  END LOOP;

  -- 4) Delegate to existing receive function to keep inventory / batch / cost
  -- allocation logic centralized (single transaction because plpgsql = one txn).
  IF jsonb_array_length(v_plan) = 0 THEN
    v_result := jsonb_build_object('ok', true, 'items_received', 0,
      'total_units', 0, 'total_damaged', 0, 'inventory_updated', 0, 'pending_planned', 0);
  ELSE
    v_result := public.receive_incoming_cargo_items(
      _merchant_id, _track_number, _received_by, v_plan
    );
  END IF;

  -- 5) Persist idempotency + audit log
  INSERT INTO public.cargo_receive_requests(
    merchant_id, request_id, track_number, received_by, result_json
  ) VALUES (
    _merchant_id, _request_id, _track_number, _received_by, v_result
  );

  INSERT INTO public.cargo_receive_logs(
    merchant_id, track_number, request_id, action, actor_id,
    before_values, after_values, meta
  ) VALUES (
    _merchant_id, _track_number, _request_id, 'receive', _received_by,
    _items, v_result, jsonb_build_object('plan_count', jsonb_array_length(v_plan))
  );

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.receive_incoming_cargo_items_v2(UUID,TEXT,UUID,JSONB,UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.receive_incoming_cargo_items_v2(UUID,TEXT,UUID,JSONB,UUID) TO authenticated;
