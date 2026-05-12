ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS coupon_id uuid REFERENCES public.coupons(id) ON DELETE SET NULL;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS coupon_discount numeric NOT NULL DEFAULT 0;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS qpay_qr_text text;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS qpay_short_url text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chatbot_settings_merchant_id_fkey'
  ) THEN
    ALTER TABLE public.chatbot_settings
      ADD CONSTRAINT chatbot_settings_merchant_id_fkey
      FOREIGN KEY (merchant_id) REFERENCES public.merchants(id) ON DELETE CASCADE;
  END IF;
END $$;