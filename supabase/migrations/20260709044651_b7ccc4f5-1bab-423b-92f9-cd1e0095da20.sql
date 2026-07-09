
ALTER TABLE public.inventory_batches
  ADD COLUMN IF NOT EXISTS remaining_quantity numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS sold_quantity numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS reserved_quantity numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS damaged_quantity numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS supplier_name text,
  ADD COLUMN IF NOT EXISTS warehouse_location text,
  ADD COLUMN IF NOT EXISTS receive_user_id uuid;

-- Backfill remaining_quantity from original quantity for existing rows
UPDATE public.inventory_batches
   SET remaining_quantity = quantity
 WHERE remaining_quantity = 0 AND quantity > 0;

-- Backfill receive_user_id from created_by
UPDATE public.inventory_batches
   SET receive_user_id = created_by
 WHERE receive_user_id IS NULL AND created_by IS NOT NULL;

-- Add non-negative validation
ALTER TABLE public.inventory_batches
  DROP CONSTRAINT IF EXISTS inventory_batches_qty_nonneg;
ALTER TABLE public.inventory_batches
  ADD CONSTRAINT inventory_batches_qty_nonneg CHECK (
    remaining_quantity >= 0
    AND sold_quantity >= 0
    AND reserved_quantity >= 0
    AND damaged_quantity >= 0
  );

CREATE INDEX IF NOT EXISTS idx_inv_batches_product ON public.inventory_batches(product_id);
CREATE INDEX IF NOT EXISTS idx_inv_batches_status  ON public.inventory_batches(status);

-- Update the trigger that creates a batch from a receipt to populate the new fields
CREATE OR REPLACE FUNCTION public.tg_create_inventory_batch_from_receipt()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_price numeric;
  v_warehouse text;
BEGIN
  IF NEW.received_quantity IS NULL OR NEW.received_quantity <= 0 OR NEW.inventory_item_id IS NULL THEN
    RETURN NEW;
  END IF;
  v_price := COALESCE(NEW.unit_cost, 0);

  SELECT warehouse_location INTO v_warehouse
    FROM public.inventory_items WHERE id = NEW.inventory_item_id;

  INSERT INTO public.inventory_batches(
    merchant_id, inventory_item_id, product_id, variant_id, track_number,
    incoming_item_id, receipt_id, received_at, quantity, purchase_price,
    landed_cost, created_by,
    remaining_quantity, sold_quantity, reserved_quantity, damaged_quantity,
    status, warehouse_location, receive_user_id
  ) VALUES (
    NEW.merchant_id, NEW.inventory_item_id, NEW.product_id, NEW.variant_id, NEW.track_number,
    NEW.incoming_item_id, NEW.id, NEW.created_at, NEW.received_quantity, v_price,
    v_price, NEW.received_by,
    NEW.received_quantity, 0, 0, COALESCE(NEW.damaged_quantity, 0),
    'active', v_warehouse, NEW.received_by
  );
  PERFORM public.recompute_inventory_item_costs(NEW.inventory_item_id);
  RETURN NEW;
END;
$function$;
