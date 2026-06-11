
revoke execute on function public.consume_coupon(uuid) from public, anon, authenticated;
revoke execute on function public.decrement_variant_stocks(jsonb) from public, anon, authenticated;
revoke execute on function public.restore_variant_stocks(jsonb) from public, anon, authenticated;
