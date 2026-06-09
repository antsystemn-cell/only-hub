GRANT EXECUTE ON FUNCTION public.has_merchant_access(uuid, uuid) TO anon;
GRANT EXECUTE ON FUNCTION public.is_platform_admin(uuid) TO anon;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, app_role) TO anon;
GRANT EXECUTE ON FUNCTION public.is_merchant_owner(uuid, uuid) TO anon;