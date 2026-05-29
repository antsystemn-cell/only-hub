
-- 1. CHATBOT_SETTINGS: remove public read; only merchant staff can read full row
DROP POLICY IF EXISTS "chatbot_settings public read enabled" ON public.chatbot_settings;

-- 2. MERCHANTS: revoke sensitive columns from anon/authenticated. Reads happen via service-role server functions.
REVOKE SELECT (delivery_api_key, delivery_webhook_secret, delivery_endpoint) ON public.merchants FROM anon;
REVOKE SELECT (delivery_api_key, delivery_webhook_secret, delivery_endpoint) ON public.merchants FROM authenticated;

-- 3. PAYMENT_PROVIDERS: revoke credentials column from anon/authenticated
REVOKE SELECT (credentials) ON public.payment_providers FROM anon;
REVOKE SELECT (credentials) ON public.payment_providers FROM authenticated;

-- 4. ORDERS: tighten guest insert policy
DROP POLICY IF EXISTS "orders insert anyone" ON public.orders;
CREATE POLICY "orders insert validated"
ON public.orders
FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.merchants m
    WHERE m.id = orders.merchant_id
      AND m.is_active = true
      AND m.approval_status = 'approved'
  )
  AND total >= 0
  AND items IS NOT NULL
  AND jsonb_typeof(items) = 'array'
  AND jsonb_array_length(items) > 0
  AND jsonb_array_length(items) <= 200
);

-- 5. STORAGE OBJECTS: ownership-aware policies
-- product-images: first folder = merchant_id
DROP POLICY IF EXISTS "Authed write product-images" ON storage.objects;
DROP POLICY IF EXISTS "Authed update product-images" ON storage.objects;
DROP POLICY IF EXISTS "Authed delete product-images" ON storage.objects;

CREATE POLICY "product-images staff write"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'product-images'
  AND (storage.foldername(name))[1] IS NOT NULL
  AND public.has_merchant_access(auth.uid(), ((storage.foldername(name))[1])::uuid)
);
CREATE POLICY "product-images staff update"
ON storage.objects FOR UPDATE TO authenticated
USING (
  bucket_id = 'product-images'
  AND (storage.foldername(name))[1] IS NOT NULL
  AND public.has_merchant_access(auth.uid(), ((storage.foldername(name))[1])::uuid)
)
WITH CHECK (
  bucket_id = 'product-images'
  AND (storage.foldername(name))[1] IS NOT NULL
  AND public.has_merchant_access(auth.uid(), ((storage.foldername(name))[1])::uuid)
);
CREATE POLICY "product-images staff delete"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'product-images'
  AND (storage.foldername(name))[1] IS NOT NULL
  AND public.has_merchant_access(auth.uid(), ((storage.foldername(name))[1])::uuid)
);

-- merchant-logos
DROP POLICY IF EXISTS "Authed write merchant-logos" ON storage.objects;
DROP POLICY IF EXISTS "Authed update merchant-logos" ON storage.objects;
DROP POLICY IF EXISTS "Authed delete merchant-logos" ON storage.objects;

CREATE POLICY "merchant-logos staff write"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'merchant-logos'
  AND (storage.foldername(name))[1] IS NOT NULL
  AND public.has_merchant_access(auth.uid(), ((storage.foldername(name))[1])::uuid)
);
CREATE POLICY "merchant-logos staff update"
ON storage.objects FOR UPDATE TO authenticated
USING (
  bucket_id = 'merchant-logos'
  AND (storage.foldername(name))[1] IS NOT NULL
  AND public.has_merchant_access(auth.uid(), ((storage.foldername(name))[1])::uuid)
)
WITH CHECK (
  bucket_id = 'merchant-logos'
  AND (storage.foldername(name))[1] IS NOT NULL
  AND public.has_merchant_access(auth.uid(), ((storage.foldername(name))[1])::uuid)
);
CREATE POLICY "merchant-logos staff delete"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'merchant-logos'
  AND (storage.foldername(name))[1] IS NOT NULL
  AND public.has_merchant_access(auth.uid(), ((storage.foldername(name))[1])::uuid)
);

-- brand-logos
DROP POLICY IF EXISTS "Authed write brand-logos" ON storage.objects;
DROP POLICY IF EXISTS "Authed update brand-logos" ON storage.objects;
DROP POLICY IF EXISTS "Authed delete brand-logos" ON storage.objects;

CREATE POLICY "brand-logos staff write"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'brand-logos'
  AND (storage.foldername(name))[1] IS NOT NULL
  AND public.has_merchant_access(auth.uid(), ((storage.foldername(name))[1])::uuid)
);
CREATE POLICY "brand-logos staff update"
ON storage.objects FOR UPDATE TO authenticated
USING (
  bucket_id = 'brand-logos'
  AND (storage.foldername(name))[1] IS NOT NULL
  AND public.has_merchant_access(auth.uid(), ((storage.foldername(name))[1])::uuid)
)
WITH CHECK (
  bucket_id = 'brand-logos'
  AND (storage.foldername(name))[1] IS NOT NULL
  AND public.has_merchant_access(auth.uid(), ((storage.foldername(name))[1])::uuid)
);
CREATE POLICY "brand-logos staff delete"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'brand-logos'
  AND (storage.foldername(name))[1] IS NOT NULL
  AND public.has_merchant_access(auth.uid(), ((storage.foldername(name))[1])::uuid)
);

-- banners: platform admin only (used for blog/marketing assets)
DROP POLICY IF EXISTS "Authed write banners" ON storage.objects;
DROP POLICY IF EXISTS "Authed update banners" ON storage.objects;
DROP POLICY IF EXISTS "Authed delete banners" ON storage.objects;

CREATE POLICY "banners admin write"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'banners' AND public.is_platform_admin(auth.uid()));
CREATE POLICY "banners admin update"
ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'banners' AND public.is_platform_admin(auth.uid()))
WITH CHECK (bucket_id = 'banners' AND public.is_platform_admin(auth.uid()));
CREATE POLICY "banners admin delete"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'banners' AND public.is_platform_admin(auth.uid()));

-- 6. FUNCTION SEARCH PATH: add to trigger functions missing it
ALTER FUNCTION public.tg_record_platform_transaction() SET search_path = public;
ALTER FUNCTION public.tg_set_updated_at() SET search_path = public;
ALTER FUNCTION public.tg_set_order_ref() SET search_path = public;
ALTER FUNCTION public.tg_apply_commission() SET search_path = public;

-- 7. SECURITY DEFINER helper functions: restrict EXECUTE to authenticated + service_role
REVOKE EXECUTE ON FUNCTION public.is_merchant_owner(uuid, uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.is_platform_admin(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.has_merchant_access(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_merchant_owner(uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_platform_admin(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.has_merchant_access(uuid, uuid) TO authenticated, service_role;
