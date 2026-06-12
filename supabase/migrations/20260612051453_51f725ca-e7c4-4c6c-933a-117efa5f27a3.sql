
-- 1) Merchants: revoke sensitive columns from client roles, grant safe set
REVOKE SELECT (owner_id, commission_rate, delivery_mode, approved_at, approved_by, rejection_reason, contact_phone, contact_name, register_number, delivery_api_key, delivery_endpoint, delivery_webhook_secret)
  ON public.merchants FROM anon, authenticated;

GRANT SELECT (id, name, slug, logo_url, description, is_active, approval_status, business_type, website_url, social_facebook, social_instagram, created_at, updated_at)
  ON public.merchants TO anon, authenticated;

-- 2) Platform settings: remove public read; only platform admins read
DROP POLICY IF EXISTS "platform_settings public read" ON public.platform_settings;
CREATE POLICY "platform_settings admin read"
  ON public.platform_settings
  FOR SELECT
  USING (public.is_platform_admin(auth.uid()));

-- 3) Realtime: stop broadcasting sensitive tables
ALTER PUBLICATION supabase_realtime DROP TABLE public.delivery_requests;
ALTER PUBLICATION supabase_realtime DROP TABLE public.delivery_status_history;
ALTER PUBLICATION supabase_realtime DROP TABLE public.coupons;

-- 4) Pin search_path on email queue helper functions
ALTER FUNCTION public.enqueue_email(text, jsonb) SET search_path = public;
ALTER FUNCTION public.read_email_batch(text, integer, integer) SET search_path = public;
ALTER FUNCTION public.move_to_dlq(text, text, bigint, jsonb) SET search_path = public;
ALTER FUNCTION public.delete_email(text, bigint) SET search_path = public;
