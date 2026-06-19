
-- 1. Merchant shipping config + policies + followers
ALTER TABLE public.merchants
  ADD COLUMN IF NOT EXISTS shipping_config jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS policy_shipping text,
  ADD COLUMN IF NOT EXISTS policy_return text,
  ADD COLUMN IF NOT EXISTS followers_count integer NOT NULL DEFAULT 0;

-- 2. Seed default platform policies if not present
INSERT INTO public.platform_settings (key, value)
VALUES
  ('policy_shipping_default', '{"content":"<h3>Хүргэлтийн нөхцөл</h3><ul><li>Улаанбаатар хотод 24-48 цагт хүргэнэ.</li><li>Орон нутагт тээврийн компаниар илгээнэ.</li><li>Захиалга баталгаажсан өдрөөс хойш хүргэлт эхэлнэ.</li></ul>"}'::jsonb)
ON CONFLICT (key) DO NOTHING;

INSERT INTO public.platform_settings (key, value)
VALUES
  ('policy_return_default', '{"content":"<h3>Буцаалтын нөхцөл</h3><ul><li>Бараа хүлээн авснаас хойш 7 хоногийн дотор буцаах боломжтой.</li><li>Бараа анхны савлагаандаа, ашиглаагүй байх ёстой.</li><li>Хувийн хэрэглээний бараа буцаалтад хамаарахгүй.</li></ul>"}'::jsonb)
ON CONFLICT (key) DO NOTHING;

-- 3. Reviews
CREATE TABLE IF NOT EXISTS public.reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  merchant_id uuid NOT NULL REFERENCES public.merchants(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  order_id uuid REFERENCES public.orders(id) ON DELETE SET NULL,
  rating integer NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment text,
  images jsonb NOT NULL DEFAULT '[]'::jsonb,
  verified_purchase boolean NOT NULL DEFAULT false,
  is_hidden boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (product_id, user_id, order_id)
);

CREATE INDEX IF NOT EXISTS reviews_product_idx ON public.reviews(product_id) WHERE is_hidden = false;
CREATE INDEX IF NOT EXISTS reviews_merchant_idx ON public.reviews(merchant_id);
CREATE INDEX IF NOT EXISTS reviews_user_idx ON public.reviews(user_id);

GRANT SELECT ON public.reviews TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.reviews TO authenticated;
GRANT ALL ON public.reviews TO service_role;

ALTER TABLE public.reviews ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read non-hidden reviews"
  ON public.reviews FOR SELECT
  USING (is_hidden = false OR public.is_platform_admin(auth.uid()) OR public.has_merchant_access(auth.uid(), merchant_id));

CREATE POLICY "Users insert own review"
  ON public.reviews FOR INSERT
  TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.orders o
       WHERE o.id = order_id
         AND o.user_id = auth.uid()
         AND o.payment_status = 'confirmed'
         AND o.delivery_status = 'delivered'
    )
  );

CREATE POLICY "Users update own review"
  ON public.reviews FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users delete own review"
  ON public.reviews FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Merchant manage reviews"
  ON public.reviews FOR UPDATE
  TO authenticated
  USING (public.has_merchant_access(auth.uid(), merchant_id))
  WITH CHECK (public.has_merchant_access(auth.uid(), merchant_id));

CREATE POLICY "Admin manage reviews"
  ON public.reviews FOR ALL
  TO authenticated
  USING (public.is_platform_admin(auth.uid()))
  WITH CHECK (public.is_platform_admin(auth.uid()));

CREATE TRIGGER reviews_updated_at
  BEFORE UPDATE ON public.reviews
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- 4. Wishlist
CREATE TABLE IF NOT EXISTS public.wishlist_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, product_id)
);

CREATE INDEX IF NOT EXISTS wishlist_user_idx ON public.wishlist_items(user_id);

GRANT SELECT, INSERT, DELETE ON public.wishlist_items TO authenticated;
GRANT ALL ON public.wishlist_items TO service_role;

ALTER TABLE public.wishlist_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own wishlist"
  ON public.wishlist_items FOR ALL
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());
