REVOKE EXECUTE ON FUNCTION public.sync_product_from_variants(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.sync_product_from_variants_trigger() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sync_product_from_variants(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.sync_product_from_variants_trigger() TO service_role;