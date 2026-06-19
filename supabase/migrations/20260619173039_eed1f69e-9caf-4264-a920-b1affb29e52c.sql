
-- 1) payment_intents: replace open SELECT with scoped policies
DROP POLICY IF EXISTS "payment_intents read all" ON public.payment_intents;

CREATE POLICY "payment_intents staff read"
ON public.payment_intents FOR SELECT
USING (
  public.has_merchant_access(auth.uid(), merchant_id)
  OR public.is_platform_admin(auth.uid())
  OR (
    auth.uid() IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.orders o
      WHERE o.id = payment_intents.order_id
        AND o.user_id = auth.uid()
    )
  )
);

-- 2) payment_providers.credentials: re-apply column-level revoke
REVOKE SELECT (credentials) ON public.payment_providers FROM anon, authenticated;

-- 3) product_variants: revoke internal cost/margin columns from anon/authenticated
REVOKE SELECT (
  source_price,
  source_currency,
  source_price_mnt,
  previous_source_price,
  profit_amount_mnt,
  profit_percent,
  cargo_cost_mnt,
  korea_domestic_shipping_mnt,
  local_delivery_cost_mnt,
  payment_fee_reserve_mnt,
  exchange_rate
) ON public.product_variants FROM anon, authenticated;

-- 4) delivery_options.phone: revoke from anon/authenticated
REVOKE SELECT (phone) ON public.delivery_options FROM anon, authenticated;
