
ALTER TYPE public.incoming_cargo_item_status ADD VALUE IF NOT EXISTS 'partially_received';

ALTER TABLE public.incoming_cargo_items
  ADD COLUMN IF NOT EXISTS damaged_quantity numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS received_unit_cost numeric,
  ADD COLUMN IF NOT EXISTS inventory_item_id uuid REFERENCES public.inventory_items(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS last_received_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_received_by uuid;

CREATE TABLE IF NOT EXISTS public.incoming_cargo_receipts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id uuid NOT NULL REFERENCES public.merchants(id) ON DELETE CASCADE,
  track_number text NOT NULL,
  incoming_item_id uuid NOT NULL REFERENCES public.incoming_cargo_items(id) ON DELETE CASCADE,
  inventory_item_id uuid REFERENCES public.inventory_items(id) ON DELETE SET NULL,
  movement_id uuid,
  product_id uuid,
  variant_id uuid,
  planned_quantity numeric NOT NULL DEFAULT 0,
  received_quantity numeric NOT NULL DEFAULT 0,
  damaged_quantity numeric NOT NULL DEFAULT 0,
  remaining_quantity numeric NOT NULL DEFAULT 0,
  unit_cost numeric,
  notes text,
  received_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS incoming_cargo_receipts_merchant_track_idx
  ON public.incoming_cargo_receipts(merchant_id, track_number);
CREATE INDEX IF NOT EXISTS incoming_cargo_receipts_item_idx
  ON public.incoming_cargo_receipts(incoming_item_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.incoming_cargo_receipts TO authenticated;
GRANT ALL ON public.incoming_cargo_receipts TO service_role;

ALTER TABLE public.incoming_cargo_receipts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "merchant access reads receipts"
  ON public.incoming_cargo_receipts FOR SELECT
  TO authenticated
  USING (public.has_merchant_access(auth.uid(), merchant_id));

CREATE POLICY "merchant access writes receipts"
  ON public.incoming_cargo_receipts FOR INSERT
  TO authenticated
  WITH CHECK (public.has_merchant_access(auth.uid(), merchant_id));

CREATE OR REPLACE FUNCTION public.receive_incoming_cargo_items(
  _merchant_id uuid,
  _track_number text,
  _received_by uuid,
  _items jsonb
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  rec record;
  v_item public.incoming_cargo_items%ROWTYPE;
  v_inv  public.inventory_items%ROWTYPE;
  v_link_inv_id uuid;
  v_new_received numeric;
  v_new_damaged numeric;
  v_total_planned numeric;
  v_qty_delta numeric;
  v_before numeric;
  v_after numeric;
  v_status public.incoming_cargo_item_status;
  v_mov_id uuid;
  v_receipt_id uuid;
  v_results jsonb := '[]'::jsonb;
  v_items_received int := 0;
  v_total_units numeric := 0;
  v_total_damaged numeric := 0;
  v_inv_updated int := 0;
  v_pending_planned int := 0;
BEGIN
  IF _merchant_id IS NULL OR _track_number IS NULL THEN
    RAISE EXCEPTION 'invalid_args';
  END IF;

  FOR rec IN
    SELECT (item->>'incoming_item_id')::uuid AS incoming_item_id,
           COALESCE((item->>'received_quantity')::numeric, 0) AS received_quantity,
           COALESCE((item->>'damaged_quantity')::numeric, 0) AS damaged_quantity,
           NULLIF(item->>'unit_cost','')::numeric AS unit_cost,
           NULLIF(item->>'notes','') AS notes
      FROM jsonb_array_elements(_items) item
  LOOP
    IF rec.received_quantity < 0 OR rec.damaged_quantity < 0 THEN
      RAISE EXCEPTION 'invalid_quantity';
    END IF;
    IF rec.received_quantity = 0 AND rec.damaged_quantity = 0 THEN
      CONTINUE;
    END IF;

    SELECT * INTO v_item FROM public.incoming_cargo_items
      WHERE id = rec.incoming_item_id AND merchant_id = _merchant_id
      FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'incoming_item_not_found:%', rec.incoming_item_id;
    END IF;
    IF v_item.track_number <> _track_number THEN
      RAISE EXCEPTION 'item_track_mismatch';
    END IF;
    IF v_item.status = 'cancelled' THEN
      RAISE EXCEPTION 'item_cancelled';
    END IF;

    v_total_planned := COALESCE(v_item.planned_quantity, 0);
    v_new_received := COALESCE(v_item.received_quantity, 0) + rec.received_quantity;
    v_new_damaged := COALESCE(v_item.damaged_quantity, 0) + rec.damaged_quantity;

    -- Resolve / create inventory item if we actually have stock to add
    v_qty_delta := rec.received_quantity;
    v_inv := NULL;

    IF v_qty_delta > 0 THEN
      IF v_item.inventory_item_id IS NOT NULL THEN
        SELECT * INTO v_inv FROM public.inventory_items
          WHERE id = v_item.inventory_item_id AND merchant_id = _merchant_id FOR UPDATE;
      END IF;

      IF v_inv.id IS NULL AND v_item.product_id IS NOT NULL THEN
        SELECT inventory_item_id INTO v_link_inv_id
          FROM public.inventory_product_links
          WHERE merchant_id = _merchant_id
            AND product_id = v_item.product_id
            AND (variant_id = v_item.variant_id OR (variant_id IS NULL AND v_item.variant_id IS NULL)
                 OR variant_id IS NULL)
            AND is_active
          ORDER BY (variant_id IS NOT NULL) DESC
          LIMIT 1;
        IF v_link_inv_id IS NOT NULL THEN
          SELECT * INTO v_inv FROM public.inventory_items
            WHERE id = v_link_inv_id FOR UPDATE;
        END IF;
      END IF;

      IF v_inv.id IS NULL THEN
        INSERT INTO public.inventory_items(
          merchant_id, name, quantity_on_hand, unit, cost_price,
          source_type, source_cargo_tracking_number, created_by
        ) VALUES (
          _merchant_id,
          v_item.planned_product_name,
          0,
          'ширхэг',
          COALESCE(rec.unit_cost, v_item.planned_unit_cost),
          'cargo',
          _track_number,
          _received_by
        ) RETURNING * INTO v_inv;
      END IF;

      v_before := COALESCE(v_inv.quantity_on_hand, 0);
      v_after := v_before + v_qty_delta;

      UPDATE public.inventory_items
         SET quantity_on_hand = v_after,
             cost_price = COALESCE(rec.unit_cost, cost_price),
             updated_at = now()
       WHERE id = v_inv.id;

      INSERT INTO public.inventory_movements(
        merchant_id, inventory_item_id, movement_type, quantity,
        before_quantity, after_quantity, source_type, source_reference,
        note, created_by
      ) VALUES (
        _merchant_id, v_inv.id, 'cargo_receive', v_qty_delta,
        v_before, v_after, 'cargo', _track_number,
        'incoming_item:' || v_item.id::text, _received_by
      ) RETURNING id INTO v_mov_id;

      v_inv_updated := v_inv_updated + 1;
    END IF;

    -- Resolve final item status
    IF v_new_received + v_new_damaged >= v_total_planned THEN
      v_status := 'received';
    ELSIF v_new_received > 0 OR v_new_damaged > 0 THEN
      v_status := 'partially_received';
    ELSE
      v_status := v_item.status;
    END IF;

    UPDATE public.incoming_cargo_items
       SET received_quantity = v_new_received,
           damaged_quantity = v_new_damaged,
           received_unit_cost = COALESCE(rec.unit_cost, received_unit_cost),
           inventory_item_id = COALESCE(v_inv.id, inventory_item_id),
           last_received_at = now(),
           last_received_by = _received_by,
           status = v_status,
           updated_at = now()
     WHERE id = v_item.id;

    INSERT INTO public.incoming_cargo_receipts(
      merchant_id, track_number, incoming_item_id, inventory_item_id, movement_id,
      product_id, variant_id, planned_quantity, received_quantity, damaged_quantity,
      remaining_quantity, unit_cost, notes, received_by
    ) VALUES (
      _merchant_id, _track_number, v_item.id, v_inv.id, v_mov_id,
      v_item.product_id, v_item.variant_id, v_total_planned, rec.received_quantity, rec.damaged_quantity,
      GREATEST(0, v_total_planned - v_new_received - v_new_damaged),
      rec.unit_cost, rec.notes, _received_by
    ) RETURNING id INTO v_receipt_id;

    v_items_received := v_items_received + 1;
    v_total_units := v_total_units + rec.received_quantity;
    v_total_damaged := v_total_damaged + rec.damaged_quantity;
    IF v_item.product_id IS NULL AND v_inv.id IS NULL THEN
      v_pending_planned := v_pending_planned + 1;
    END IF;

    v_results := v_results || jsonb_build_object(
      'incoming_item_id', v_item.id,
      'inventory_item_id', v_inv.id,
      'movement_id', v_mov_id,
      'receipt_id', v_receipt_id,
      'status', v_status,
      'new_received', v_new_received,
      'new_damaged', v_new_damaged
    );
  END LOOP;

  RETURN jsonb_build_object(
    'ok', true,
    'items_received', v_items_received,
    'total_units', v_total_units,
    'total_damaged', v_total_damaged,
    'inventory_updated', v_inv_updated,
    'pending_planned', v_pending_planned,
    'results', v_results
  );
END;
$$;

REVOKE ALL ON FUNCTION public.receive_incoming_cargo_items(uuid, text, uuid, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.receive_incoming_cargo_items(uuid, text, uuid, jsonb) TO authenticated, service_role;
