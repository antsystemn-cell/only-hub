
ALTER TABLE public.merchants
  ADD COLUMN IF NOT EXISTS approval_status text NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS rejection_reason text,
  ADD COLUMN IF NOT EXISTS approved_at timestamptz,
  ADD COLUMN IF NOT EXISTS approved_by uuid REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS contact_phone text,
  ADD COLUMN IF NOT EXISTS contact_name text,
  ADD COLUMN IF NOT EXISTS business_type text,
  ADD COLUMN IF NOT EXISTS register_number text;

UPDATE public.merchants
SET approval_status = 'approved', approved_at = COALESCE(approved_at, now())
WHERE is_active = true AND approval_status = 'pending';

DROP POLICY IF EXISTS "Public read active merchants" ON public.merchants;
CREATE POLICY "Public read active merchants" ON public.merchants
  FOR SELECT USING (is_active = true AND approval_status = 'approved');

DROP POLICY IF EXISTS "Admin read all merchants" ON public.merchants;
CREATE POLICY "Admin read all merchants" ON public.merchants
  FOR SELECT USING (public.is_platform_admin(auth.uid()));

DROP POLICY IF EXISTS "Owner read own merchant" ON public.merchants;
CREATE POLICY "Owner read own merchant" ON public.merchants
  FOR SELECT USING (owner_id = auth.uid());
