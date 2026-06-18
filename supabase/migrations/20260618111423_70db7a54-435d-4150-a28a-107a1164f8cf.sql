CREATE POLICY "brand-logos platform admin write"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'brand-logos'
  AND (storage.foldername(name))[1] = 'platform'
  AND public.is_platform_admin(auth.uid())
);

CREATE POLICY "brand-logos platform admin update"
ON storage.objects FOR UPDATE TO authenticated
USING (
  bucket_id = 'brand-logos'
  AND (storage.foldername(name))[1] = 'platform'
  AND public.is_platform_admin(auth.uid())
)
WITH CHECK (
  bucket_id = 'brand-logos'
  AND (storage.foldername(name))[1] = 'platform'
  AND public.is_platform_admin(auth.uid())
);

CREATE POLICY "brand-logos platform admin delete"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'brand-logos'
  AND (storage.foldername(name))[1] = 'platform'
  AND public.is_platform_admin(auth.uid())
);