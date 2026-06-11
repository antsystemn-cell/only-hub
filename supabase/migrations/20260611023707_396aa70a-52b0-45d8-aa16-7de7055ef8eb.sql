
-- Tighten merchant column exposure: hide sensitive ops/PII from anon/authenticated.
-- Staff/admin paths use supabaseAdmin (service_role bypasses these revokes).
REVOKE SELECT (
  delivery_api_key,
  delivery_webhook_secret,
  delivery_endpoint,
  delivery_mode,
  contact_phone,
  contact_name,
  register_number,
  commission_rate,
  approved_by
) ON public.merchants FROM anon, authenticated;

-- Payment provider credentials must never leak to clients.
REVOKE SELECT (credentials) ON public.payment_providers FROM anon, authenticated;

-- Chatbot prompt/knowledge — defence in depth (already no public SELECT policy).
REVOKE SELECT (system_prompt, knowledge) ON public.chatbot_settings FROM anon, authenticated;

-- Coupons: stop public enumeration. Validation flows through validateCoupon server fn (supabaseAdmin).
DROP POLICY IF EXISTS "coupons public read active" ON public.coupons;

-- Delivery webhooks: keep writes service_role only. Add explicit deny policies for clarity.
DROP POLICY IF EXISTS "delivery_webhooks no client writes" ON public.delivery_webhooks;
CREATE POLICY "delivery_webhooks no client writes"
  ON public.delivery_webhooks
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (false);

DROP POLICY IF EXISTS "delivery_webhooks no client updates" ON public.delivery_webhooks;
CREATE POLICY "delivery_webhooks no client updates"
  ON public.delivery_webhooks
  FOR UPDATE
  TO anon, authenticated
  USING (false)
  WITH CHECK (false);

DROP POLICY IF EXISTS "delivery_webhooks no client deletes" ON public.delivery_webhooks;
CREATE POLICY "delivery_webhooks no client deletes"
  ON public.delivery_webhooks
  FOR DELETE
  TO anon, authenticated
  USING (false);
