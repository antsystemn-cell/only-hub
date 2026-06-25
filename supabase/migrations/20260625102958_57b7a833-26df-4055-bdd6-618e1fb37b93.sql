
REVOKE EXECUTE ON FUNCTION public.reserve_inventory_for_order(uuid, uuid, jsonb, int) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.confirm_inventory_reservations(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.release_inventory_reservations(uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.expire_inventory_reservations() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_inventory_for_order(uuid, uuid, jsonb, int) TO service_role;
GRANT EXECUTE ON FUNCTION public.confirm_inventory_reservations(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.release_inventory_reservations(uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.expire_inventory_reservations() TO service_role;
