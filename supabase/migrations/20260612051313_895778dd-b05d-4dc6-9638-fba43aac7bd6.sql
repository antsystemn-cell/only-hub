
REVOKE SELECT (credentials) ON public.payment_providers FROM anon;
REVOKE SELECT (credentials) ON public.payment_providers FROM authenticated;
GRANT SELECT (id, merchant_id, name, provider_type, logo_url, icon, description, is_active, position, created_at, updated_at) ON public.payment_providers TO anon, authenticated;

DROP POLICY IF EXISTS "orders insert validated" ON public.orders;
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
  AND coalesce(payment_status, 'unpaid') = 'unpaid'
  AND paid_at IS NULL
  AND platform_commission_rate IS NULL
  AND platform_commission_amount IS NULL
  AND coalesce(coupon_discount, 0) >= 0
  AND coalesce(coupon_discount, 0) <= total
  AND status IN ('pending','new')
);

ALTER PUBLICATION supabase_realtime DROP TABLE public.orders;
