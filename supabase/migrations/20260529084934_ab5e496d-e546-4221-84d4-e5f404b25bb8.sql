DROP TRIGGER IF EXISTS trg_delivery_request_history ON public.delivery_requests;

CREATE OR REPLACE FUNCTION public.tg_delivery_request_history()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
BEGIN
  IF TG_OP = 'INSERT' OR NEW.status IS DISTINCT FROM OLD.status THEN
    INSERT INTO public.delivery_status_history (delivery_request_id, status, note, changed_by)
    VALUES (NEW.id, NEW.status, NEW.last_error, auth.uid());

    UPDATE public.orders
       SET delivery_status = NEW.status,
           updated_at = now(),
           status = CASE
             WHEN NEW.status = 'delivered' THEN 'completed'
             WHEN NEW.status IN ('picked_up','in_transit','assigned') THEN 'delivering'
             WHEN NEW.status = 'cancelled' THEN 'cancelled'
             ELSE orders.status
           END
     WHERE id = NEW.order_id;
  END IF;
  RETURN NEW;
END $function$;

CREATE TRIGGER trg_delivery_request_history
AFTER INSERT OR UPDATE ON public.delivery_requests
FOR EACH ROW EXECUTE FUNCTION public.tg_delivery_request_history();

DROP TRIGGER IF EXISTS trg_delivery_requests_updated_at ON public.delivery_requests;
CREATE TRIGGER trg_delivery_requests_updated_at
BEFORE UPDATE ON public.delivery_requests
FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();