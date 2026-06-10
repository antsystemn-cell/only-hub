ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS paid_at TIMESTAMPTZ;
CREATE INDEX IF NOT EXISTS orders_paid_at_idx ON public.orders (paid_at) WHERE paid_at IS NOT NULL;