
CREATE POLICY "merchant-logos platform admin write" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'merchant-logos' AND public.is_platform_admin(auth.uid()));

CREATE POLICY "merchant-logos platform admin update" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'merchant-logos' AND public.is_platform_admin(auth.uid()))
  WITH CHECK (bucket_id = 'merchant-logos' AND public.is_platform_admin(auth.uid()));

CREATE POLICY "merchant-logos platform admin delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'merchant-logos' AND public.is_platform_admin(auth.uid()));
