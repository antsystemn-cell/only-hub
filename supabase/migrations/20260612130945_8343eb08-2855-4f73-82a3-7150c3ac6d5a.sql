DROP POLICY IF EXISTS "brand-logos staff write" ON storage.objects;
DROP POLICY IF EXISTS "brand-logos staff update" ON storage.objects;
DROP POLICY IF EXISTS "brand-logos staff delete" ON storage.objects;
DROP POLICY IF EXISTS "product-images staff write" ON storage.objects;
DROP POLICY IF EXISTS "product-images staff update" ON storage.objects;
DROP POLICY IF EXISTS "product-images staff delete" ON storage.objects;

CREATE POLICY "brand-logos staff write"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'brand-logos'
  AND CASE
    WHEN (storage.foldername(name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    THEN public.has_merchant_access(auth.uid(), ((storage.foldername(name))[1])::uuid)
    ELSE false
  END
);

CREATE POLICY "brand-logos staff update"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'brand-logos'
  AND CASE
    WHEN (storage.foldername(name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    THEN public.has_merchant_access(auth.uid(), ((storage.foldername(name))[1])::uuid)
    ELSE false
  END
)
WITH CHECK (
  bucket_id = 'brand-logos'
  AND CASE
    WHEN (storage.foldername(name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    THEN public.has_merchant_access(auth.uid(), ((storage.foldername(name))[1])::uuid)
    ELSE false
  END
);

CREATE POLICY "brand-logos staff delete"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'brand-logos'
  AND CASE
    WHEN (storage.foldername(name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    THEN public.has_merchant_access(auth.uid(), ((storage.foldername(name))[1])::uuid)
    ELSE false
  END
);

CREATE POLICY "product-images staff write"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'product-images'
  AND CASE
    WHEN (storage.foldername(name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    THEN public.has_merchant_access(auth.uid(), ((storage.foldername(name))[1])::uuid)
    ELSE false
  END
);

CREATE POLICY "product-images staff update"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'product-images'
  AND CASE
    WHEN (storage.foldername(name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    THEN public.has_merchant_access(auth.uid(), ((storage.foldername(name))[1])::uuid)
    ELSE false
  END
)
WITH CHECK (
  bucket_id = 'product-images'
  AND CASE
    WHEN (storage.foldername(name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    THEN public.has_merchant_access(auth.uid(), ((storage.foldername(name))[1])::uuid)
    ELSE false
  END
);

CREATE POLICY "product-images staff delete"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'product-images'
  AND CASE
    WHEN (storage.foldername(name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    THEN public.has_merchant_access(auth.uid(), ((storage.foldername(name))[1])::uuid)
    ELSE false
  END
);