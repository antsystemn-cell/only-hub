ALTER TABLE public.orders 
  ADD COLUMN IF NOT EXISTS qpay_qr_image text,
  ADD COLUMN IF NOT EXISTS qpay_urls jsonb NOT NULL DEFAULT '[]'::jsonb;