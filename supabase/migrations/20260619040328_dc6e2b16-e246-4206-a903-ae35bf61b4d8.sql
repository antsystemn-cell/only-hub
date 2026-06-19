
CREATE POLICY "platform_settings public read whitelist"
  ON public.platform_settings FOR SELECT
  USING (key IN ('policy_shipping_default','policy_return_default','platform_logo_url'));
