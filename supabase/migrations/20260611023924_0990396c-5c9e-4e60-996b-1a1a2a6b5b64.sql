
-- Additional merchant column protection.
REVOKE SELECT (rejection_reason, approved_at, owner_id) ON public.merchants FROM anon, authenticated;

-- Drop the open "public read by id" policy on payment_requests. Customer-facing
-- invoice page uses a server function (getPaymentRequestByOrderFn) with admin client.
DROP POLICY IF EXISTS "payment_requests public read by id" ON public.payment_requests;

-- Defence in depth: ensure sensitive payment_request columns are not exposed to clients.
REVOKE SELECT (customer_phone, last_error, last_sms_error) ON public.payment_requests FROM anon, authenticated;
