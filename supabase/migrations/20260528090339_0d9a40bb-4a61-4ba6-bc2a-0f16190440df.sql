
DROP POLICY IF EXISTS "shipping_rules public read active" ON public.shipping_rules;
DROP POLICY IF EXISTS "shipping_rules staff manage" ON public.shipping_rules;
DROP POLICY IF EXISTS "bundle_campaigns public read active" ON public.bundle_campaigns;
DROP POLICY IF EXISTS "bundle_campaigns merchant manage" ON public.bundle_campaigns;
DROP TRIGGER IF EXISTS tg_shipping_rules_updated_at ON public.shipping_rules;
DROP TRIGGER IF EXISTS tg_bundle_campaigns_updated_at ON public.bundle_campaigns;

CREATE POLICY "shipping_rules public read active"
  ON public.shipping_rules FOR SELECT
  USING (is_active = true OR has_merchant_access(auth.uid(), merchant_id));

CREATE POLICY "shipping_rules staff manage"
  ON public.shipping_rules FOR ALL
  USING (has_merchant_access(auth.uid(), merchant_id) OR is_platform_admin(auth.uid()))
  WITH CHECK (has_merchant_access(auth.uid(), merchant_id) OR is_platform_admin(auth.uid()));

CREATE TRIGGER tg_shipping_rules_updated_at
  BEFORE UPDATE ON public.shipping_rules
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

CREATE POLICY "bundle_campaigns public read active"
  ON public.bundle_campaigns FOR SELECT
  USING (
    is_active = true
    OR (merchant_id IS NOT NULL AND has_merchant_access(auth.uid(), merchant_id))
    OR is_platform_admin(auth.uid())
  );

CREATE POLICY "bundle_campaigns merchant manage"
  ON public.bundle_campaigns FOR ALL
  USING (
    (merchant_id IS NOT NULL AND has_merchant_access(auth.uid(), merchant_id))
    OR is_platform_admin(auth.uid())
  )
  WITH CHECK (
    (merchant_id IS NOT NULL AND has_merchant_access(auth.uid(), merchant_id))
    OR is_platform_admin(auth.uid())
  );

CREATE TRIGGER tg_bundle_campaigns_updated_at
  BEFORE UPDATE ON public.bundle_campaigns
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();
