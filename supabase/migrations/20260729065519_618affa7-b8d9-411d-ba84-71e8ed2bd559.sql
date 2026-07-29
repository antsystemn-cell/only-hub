DO $$
BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.product_variants;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
END$$;
ALTER TABLE public.product_variants REPLICA IDENTITY FULL;