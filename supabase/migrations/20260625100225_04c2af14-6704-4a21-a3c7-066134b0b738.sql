
-- ============================================================
-- inventory_product_links
-- ============================================================
CREATE TABLE IF NOT EXISTS public.inventory_product_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id uuid NOT NULL,
  store_id uuid,
  inventory_item_id uuid NOT NULL REFERENCES public.inventory_items(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  variant_id uuid REFERENCES public.product_variants(id) ON DELETE CASCADE,
  sync_mode text NOT NULL DEFAULT 'auto' CHECK (sync_mode IN ('auto','manual')),
  quantity_multiplier numeric NOT NULL DEFAULT 1 CHECK (quantity_multiplier > 0),
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- One active link per product/variant target
CREATE UNIQUE INDEX IF NOT EXISTS uq_inv_link_active_variant
  ON public.inventory_product_links (merchant_id, product_id, variant_id)
  WHERE is_active AND variant_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_inv_link_active_product
  ON public.inventory_product_links (merchant_id, product_id)
  WHERE is_active AND variant_id IS NULL;

CREATE INDEX IF NOT EXISTS ix_inv_link_item ON public.inventory_product_links (inventory_item_id) WHERE is_active;
CREATE INDEX IF NOT EXISTS ix_inv_link_product ON public.inventory_product_links (product_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.inventory_product_links TO authenticated;
GRANT ALL ON public.inventory_product_links TO service_role;
ALTER TABLE public.inventory_product_links ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Merchants manage their inventory links"
  ON public.inventory_product_links FOR ALL TO authenticated
  USING (public.has_merchant_access(auth.uid(), merchant_id))
  WITH CHECK (public.has_merchant_access(auth.uid(), merchant_id));

CREATE POLICY "Admins read all inventory links"
  ON public.inventory_product_links FOR SELECT TO authenticated
  USING (public.is_platform_admin(auth.uid()));

CREATE TRIGGER trg_inv_links_updated_at
  BEFORE UPDATE ON public.inventory_product_links
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- ============================================================
-- inventory_sync_logs
-- ============================================================
CREATE TABLE IF NOT EXISTS public.inventory_sync_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id uuid NOT NULL,
  inventory_item_id uuid REFERENCES public.inventory_items(id) ON DELETE SET NULL,
  product_id uuid REFERENCES public.products(id) ON DELETE SET NULL,
  variant_id uuid REFERENCES public.product_variants(id) ON DELETE SET NULL,
  link_id uuid REFERENCES public.inventory_product_links(id) ON DELETE SET NULL,
  old_stock numeric,
  new_stock numeric,
  sync_status text NOT NULL DEFAULT 'ok',
  error_message text,
  trigger_source text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ix_inv_sync_logs_merchant ON public.inventory_sync_logs (merchant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS ix_inv_sync_logs_item ON public.inventory_sync_logs (inventory_item_id, created_at DESC);

GRANT SELECT ON public.inventory_sync_logs TO authenticated;
GRANT ALL ON public.inventory_sync_logs TO service_role;
ALTER TABLE public.inventory_sync_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Merchants read their sync logs"
  ON public.inventory_sync_logs FOR SELECT TO authenticated
  USING (public.has_merchant_access(auth.uid(), merchant_id));

CREATE POLICY "Admins read all sync logs"
  ON public.inventory_sync_logs FOR SELECT TO authenticated
  USING (public.is_platform_admin(auth.uid()));

-- ============================================================
-- Core sync routine
-- ============================================================
CREATE OR REPLACE FUNCTION public.sync_inventory_link(_link_id uuid, _trigger text DEFAULT 'manual')
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_link        public.inventory_product_links%ROWTYPE;
  v_item        public.inventory_items%ROWTYPE;
  v_available   numeric;
  v_new         integer;
  v_old         integer;
  v_variant_key text;
  v_status      text := 'ok';
  v_error       text;
BEGIN
  SELECT * INTO v_link FROM public.inventory_product_links WHERE id = _link_id;
  IF NOT FOUND OR NOT v_link.is_active THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'link_inactive');
  END IF;

  SELECT * INTO v_item FROM public.inventory_items WHERE id = v_link.inventory_item_id;
  IF NOT FOUND THEN
    INSERT INTO public.inventory_sync_logs(merchant_id, link_id, sync_status, error_message, trigger_source)
    VALUES (v_link.merchant_id, v_link.id, 'error', 'inventory_item_missing', _trigger);
    RETURN jsonb_build_object('ok', false, 'reason', 'inventory_item_missing');
  END IF;

  v_available := GREATEST(0, COALESCE(v_item.quantity_on_hand,0) - COALESCE(v_item.quantity_reserved,0));
  v_new := GREATEST(0, floor(v_available / NULLIF(v_link.quantity_multiplier,0))::int);

  BEGIN
    IF v_link.variant_id IS NOT NULL THEN
      SELECT option_signature INTO v_variant_key
        FROM public.product_variants
        WHERE id = v_link.variant_id;

      IF v_variant_key IS NULL OR length(v_variant_key) = 0 THEN
        v_status := 'error';
        v_error := 'variant_key_missing';
      ELSE
        SELECT COALESCE(NULLIF(variant_stock->>v_variant_key,'')::int, 0) INTO v_old
          FROM public.products WHERE id = v_link.product_id;

        UPDATE public.products
          SET variant_stock = jsonb_set(
                COALESCE(variant_stock,'{}'::jsonb),
                ARRAY[v_variant_key],
                to_jsonb(v_new),
                true
              ),
              updated_at = now()
          WHERE id = v_link.product_id
            AND merchant_id = v_link.merchant_id;
      END IF;
    ELSE
      SELECT COALESCE(stock_quantity,0) INTO v_old
        FROM public.products WHERE id = v_link.product_id;

      UPDATE public.products
        SET stock_quantity = v_new, updated_at = now()
        WHERE id = v_link.product_id
          AND merchant_id = v_link.merchant_id;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    v_status := 'error';
    v_error := SQLERRM;
  END;

  INSERT INTO public.inventory_sync_logs(
    merchant_id, inventory_item_id, product_id, variant_id, link_id,
    old_stock, new_stock, sync_status, error_message, trigger_source
  ) VALUES (
    v_link.merchant_id, v_link.inventory_item_id, v_link.product_id, v_link.variant_id, v_link.id,
    v_old, v_new, v_status, v_error, _trigger
  );

  RETURN jsonb_build_object('ok', v_status = 'ok', 'old_stock', v_old, 'new_stock', v_new, 'error', v_error);
END;
$$;

REVOKE ALL ON FUNCTION public.sync_inventory_link(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.sync_inventory_link(uuid, text) TO authenticated, service_role;

-- ============================================================
-- Trigger: when inventory item quantities change, sync all active links
-- ============================================================
CREATE OR REPLACE FUNCTION public.tg_inventory_item_sync_links()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r record;
BEGIN
  IF TG_OP = 'UPDATE'
     AND NEW.quantity_on_hand IS NOT DISTINCT FROM OLD.quantity_on_hand
     AND NEW.quantity_reserved IS NOT DISTINCT FROM OLD.quantity_reserved THEN
    RETURN NEW;
  END IF;

  FOR r IN
    SELECT id FROM public.inventory_product_links
     WHERE inventory_item_id = NEW.id
       AND is_active
       AND sync_mode = 'auto'
  LOOP
    PERFORM public.sync_inventory_link(r.id, 'auto:inventory_item_change');
  END LOOP;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_inventory_items_sync_links ON public.inventory_items;
CREATE TRIGGER trg_inventory_items_sync_links
  AFTER INSERT OR UPDATE ON public.inventory_items
  FOR EACH ROW EXECUTE FUNCTION public.tg_inventory_item_sync_links();
