
DO $$
BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.orders;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.delivery_requests;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.delivery_status_history;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.platform_transactions;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
END $$;

ALTER TABLE public.orders REPLICA IDENTITY FULL;
ALTER TABLE public.delivery_requests REPLICA IDENTITY FULL;
