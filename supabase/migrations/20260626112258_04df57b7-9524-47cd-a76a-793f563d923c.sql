
CREATE TYPE public.incoming_cargo_item_status AS ENUM (
  'planned', 'waiting_arrival', 'ready_to_receive', 'received', 'cancelled'
);

CREATE TABLE public.incoming_cargo_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id uuid NOT NULL REFERENCES public.merchants(id) ON DELETE CASCADE,
  track_number text NOT NULL,
  product_id uuid REFERENCES public.products(id) ON DELETE SET NULL,
  variant_id uuid REFERENCES public.product_variants(id) ON DELETE SET NULL,
  planned_product_name text NOT NULL,
  planned_quantity numeric(14,2) NOT NULL CHECK (planned_quantity > 0),
  planned_unit_cost numeric(14,2),
  received_quantity numeric(14,2) NOT NULL DEFAULT 0,
  notes text,
  status public.incoming_cargo_item_status NOT NULL DEFAULT 'planned',
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_incoming_cargo_items_merchant_track
  ON public.incoming_cargo_items(merchant_id, track_number);
CREATE INDEX idx_incoming_cargo_items_status
  ON public.incoming_cargo_items(merchant_id, status);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.incoming_cargo_items TO authenticated;
GRANT ALL ON public.incoming_cargo_items TO service_role;

ALTER TABLE public.incoming_cargo_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Merchant users can view their incoming cargo items"
  ON public.incoming_cargo_items FOR SELECT TO authenticated
  USING (public.has_merchant_access(auth.uid(), merchant_id));

CREATE POLICY "Merchant users can insert incoming cargo items"
  ON public.incoming_cargo_items FOR INSERT TO authenticated
  WITH CHECK (public.has_merchant_access(auth.uid(), merchant_id));

CREATE POLICY "Merchant users can update incoming cargo items"
  ON public.incoming_cargo_items FOR UPDATE TO authenticated
  USING (public.has_merchant_access(auth.uid(), merchant_id))
  WITH CHECK (public.has_merchant_access(auth.uid(), merchant_id));

CREATE POLICY "Merchant users can delete incoming cargo items"
  ON public.incoming_cargo_items FOR DELETE TO authenticated
  USING (public.has_merchant_access(auth.uid(), merchant_id));

CREATE TRIGGER trg_incoming_cargo_items_updated_at
  BEFORE UPDATE ON public.incoming_cargo_items
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
