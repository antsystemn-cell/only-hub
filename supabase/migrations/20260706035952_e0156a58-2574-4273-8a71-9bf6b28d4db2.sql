
-- Revoke sensitive columns from anon/authenticated (column-level)
REVOKE SELECT (phone) ON public.delivery_options FROM anon, authenticated;

REVOKE SELECT (onlycargo_phone, onlycargo_customer_code, commission_rate, delivery_webhook_secret)
  ON public.merchants FROM anon, authenticated;

REVOKE SELECT (credentials) ON public.payment_providers FROM anon, authenticated;

REVOKE SELECT (
  source_price, source_price_mnt, exchange_rate, cargo_cost_mnt,
  payment_fee_reserve_mnt, profit_percent, profit_amount_mnt,
  risk_buffer_mnt, previous_source_price, korea_domestic_shipping_mnt
) ON public.product_variants FROM anon, authenticated;
