
CREATE TABLE public.payment_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL UNIQUE,
  merchant_id uuid NOT NULL,
  customer_phone text,
  amount numeric NOT NULL DEFAULT 0,
  payment_provider text NOT NULL DEFAULT 'qpay',
  invoice_id text,
  invoice_url text,
  qr_text text,
  qr_image text,
  bank_account jsonb,
  status text NOT NULL DEFAULT 'pending',
  sms_sent_at timestamptz,
  sms_attempts integer NOT NULL DEFAULT 0,
  last_sms_error text,
  last_error text,
  expires_at timestamptz,
  paid_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_payment_requests_merchant ON public.payment_requests(merchant_id, status);
CREATE INDEX idx_payment_requests_invoice ON public.payment_requests(invoice_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.payment_requests TO authenticated;
GRANT SELECT ON public.payment_requests TO anon;
GRANT ALL ON public.payment_requests TO service_role;

ALTER TABLE public.payment_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "payment_requests staff manage" ON public.payment_requests
  FOR ALL USING (
    public.has_merchant_access(auth.uid(), merchant_id)
    OR public.is_platform_admin(auth.uid())
  ) WITH CHECK (
    public.has_merchant_access(auth.uid(), merchant_id)
    OR public.is_platform_admin(auth.uid())
  );

CREATE POLICY "payment_requests customer read by order" ON public.payment_requests
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.orders o
      WHERE o.id = payment_requests.order_id
        AND (o.user_id = auth.uid())
    )
  );

CREATE POLICY "payment_requests public read by id" ON public.payment_requests
  FOR SELECT USING (true);

CREATE TRIGGER trg_payment_requests_updated_at
BEFORE UPDATE ON public.payment_requests
FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();
