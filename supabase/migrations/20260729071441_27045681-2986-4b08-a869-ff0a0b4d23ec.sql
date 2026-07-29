REVOKE EXECUTE ON FUNCTION public.sync_product_from_variants(uuid) FROM service_role;
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
    UPDATE public.products
    SET
      colors = COALESCE((
        SELECT jsonb_agg(color_label ORDER BY color_label)
        FROM (
          SELECT DISTINCT color_label
          FROM public.product_variants
          WHERE product_id = v_product_id
            AND is_visible = true
            AND NULLIF(btrim(color_label), '') IS NOT NULL
        ) c
      ), '[]'::jsonb),
      sizes = COALESCE((
        SELECT jsonb_agg(size_label ORDER BY size_label)
        FROM (
          SELECT DISTINCT size_label
          FROM public.product_variants
          WHERE product_id = v_product_id
            AND is_visible = true
            AND NULLIF(btrim(size_label), '') IS NOT NULL
        ) s
      ), '[]'::jsonb),
      price = COALESCE((
        SELECT MIN(rounded_customer_price_mnt)
        FROM public.product_variants
        WHERE product_id = v_product_id
          AND is_visible = true
          AND is_purchasable = true
          AND rounded_customer_price_mnt IS NOT NULL
      ), price),
      updated_at = now()
    WHERE id = v_product_id
      AND product_type = 'FOREIGN_ORDER';
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.sync_product_from_variants_trigger() FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.sync_product_from_variants_trigger() TO postgres;