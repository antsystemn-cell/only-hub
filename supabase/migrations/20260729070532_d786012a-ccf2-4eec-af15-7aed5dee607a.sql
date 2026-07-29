CREATE OR REPLACE FUNCTION public.sync_product_from_variants(_product_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_colors jsonb;
  v_sizes jsonb;
  v_min_price numeric;
BEGIN
  SELECT COALESCE(jsonb_agg(color_label ORDER BY color_label), '[]'::jsonb)
  INTO v_colors
  FROM (
    SELECT DISTINCT color_label
    FROM public.product_variants
    WHERE product_id = _product_id
      AND is_visible = true
      AND NULLIF(btrim(color_label), '') IS NOT NULL
  ) c;

  SELECT COALESCE(jsonb_agg(size_label ORDER BY size_label), '[]'::jsonb)
  INTO v_sizes
  FROM (
    SELECT DISTINCT size_label
    FROM public.product_variants
    WHERE product_id = _product_id
      AND is_visible = true
      AND NULLIF(btrim(size_label), '') IS NOT NULL
  ) s;

  SELECT MIN(rounded_customer_price_mnt)
  INTO v_min_price
  FROM public.product_variants
  WHERE product_id = _product_id
    AND is_visible = true
    AND is_purchasable = true
    AND rounded_customer_price_mnt IS NOT NULL;

  UPDATE public.products
  SET
    colors = v_colors,
    sizes = v_sizes,
    price = COALESCE(v_min_price, price),
    updated_at = now()
  WHERE id = _product_id
    AND product_type = 'FOREIGN_ORDER';
END;
$$;

CREATE OR REPLACE FUNCTION public.sync_product_from_variants_trigger()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_product_id uuid;
BEGIN
  v_product_id := COALESCE(NEW.product_id, OLD.product_id);
  IF v_product_id IS NOT NULL THEN
    PERFORM public.sync_product_from_variants(v_product_id);
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_product_from_variants ON public.product_variants;
CREATE TRIGGER trg_sync_product_from_variants
AFTER INSERT OR UPDATE OR DELETE ON public.product_variants
FOR EACH ROW
EXECUTE FUNCTION public.sync_product_from_variants_trigger();

SELECT public.sync_product_from_variants(id)
FROM public.products
WHERE product_type = 'FOREIGN_ORDER';