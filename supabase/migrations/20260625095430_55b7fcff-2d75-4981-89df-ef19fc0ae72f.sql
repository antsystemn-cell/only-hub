
CREATE OR REPLACE FUNCTION public.create_inventory_from_cargo(
  _merchant_id uuid,
  _name text,
  _sku text,
  _quantity numeric,
  _unit text,
  _cost_price numeric,
  _warehouse_location text,
  _tracking_number text,
  _cargo_id text,
  _note text,
  _created_by uuid
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_item_id uuid;
BEGIN
  IF _quantity IS NULL OR _quantity <= 0 OR _quantity > 1000000 THEN
    RAISE EXCEPTION 'invalid_quantity';
  END IF;
  IF _unit IS NULL OR length(btrim(_unit)) = 0 THEN
    RAISE EXCEPTION 'invalid_unit';
  END IF;

  INSERT INTO public.inventory_items (
    merchant_id, name, sku, quantity_on_hand, unit, cost_price,
    warehouse_location, source_type, source_cargo_tracking_number,
    source_cargo_id, created_by
  ) VALUES (
    _merchant_id, _name, NULLIF(_sku,''), _quantity, _unit, _cost_price,
    NULLIF(_warehouse_location,''), 'cargo', _tracking_number,
    NULLIF(_cargo_id,''), _created_by
  )
  RETURNING id INTO v_item_id;

  INSERT INTO public.inventory_movements (
    merchant_id, inventory_item_id, movement_type, quantity,
    before_quantity, after_quantity, source_type, source_reference,
    note, created_by
  ) VALUES (
    _merchant_id, v_item_id, 'cargo_received', _quantity,
    0, _quantity, 'cargo', _tracking_number,
    NULLIF(_note,''), _created_by
  );

  RETURN v_item_id;
END;
$$;

REVOKE ALL ON FUNCTION public.create_inventory_from_cargo(uuid,text,text,numeric,text,numeric,text,text,text,text,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_inventory_from_cargo(uuid,text,text,numeric,text,numeric,text,text,text,text,uuid) TO authenticated, service_role;
