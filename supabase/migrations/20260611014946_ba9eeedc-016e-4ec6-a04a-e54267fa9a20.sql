
-- =====================================================================
-- Block C: atomic coupon counting + race-safe variant stock decrement
-- =====================================================================

-- 1) Atomic coupon consumption ---------------------------------------------
create or replace function public.consume_coupon(_coupon_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_updated int;
begin
  update public.coupons
     set used_count = used_count + 1,
         updated_at = now()
   where id = _coupon_id
     and is_active = true
     and (expires_at is null or expires_at > now())
     and (max_uses is null or used_count < max_uses);
  get diagnostics v_updated = row_count;
  return v_updated > 0;
end;
$$;

grant execute on function public.consume_coupon(uuid) to service_role;

-- 2) Race-safe variant stock decrement -------------------------------------
-- Input shape: jsonb array of { product_id, variant_key, qty }
-- Returns: { ok: bool, insufficient?: [...] }
create or replace function public.decrement_variant_stocks(_items jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  rec record;
  v_current int;
  insufficient jsonb := '[]'::jsonb;
begin
  -- Lock rows in deterministic order to avoid deadlocks across concurrent checkouts.
  perform 1
    from public.products
   where id in (
     select distinct (item->>'product_id')::uuid
     from jsonb_array_elements(_items) item
   )
   order by id
   for update;

  -- Phase 1: validate availability (only for explicitly tracked variants)
  for rec in
    select (item->>'product_id')::uuid as product_id,
           nullif(item->>'variant_key','') as variant_key,
           (item->>'qty')::int as qty
      from jsonb_array_elements(_items) item
  loop
    if rec.variant_key is null then
      continue;
    end if;
    select case when (variant_stock ? rec.variant_key)
                then (variant_stock->>rec.variant_key)::int
                else null end
      into v_current
      from public.products
     where id = rec.product_id;
    if v_current is null then
      continue; -- variant untracked → unlimited
    end if;
    if v_current < rec.qty then
      insufficient := insufficient || jsonb_build_object(
        'product_id', rec.product_id,
        'variant_key', rec.variant_key,
        'remaining', v_current,
        'requested', rec.qty
      );
    end if;
  end loop;

  if jsonb_array_length(insufficient) > 0 then
    return jsonb_build_object('ok', false, 'insufficient', insufficient);
  end if;

  -- Phase 2: apply decrements
  for rec in
    select (item->>'product_id')::uuid as product_id,
           nullif(item->>'variant_key','') as variant_key,
           (item->>'qty')::int as qty
      from jsonb_array_elements(_items) item
  loop
    if rec.variant_key is null then
      continue;
    end if;
    update public.products
       set variant_stock = jsonb_set(
             coalesce(variant_stock, '{}'::jsonb),
             array[rec.variant_key],
             to_jsonb(greatest(0,
               coalesce((variant_stock->>rec.variant_key)::int, 0) - rec.qty
             ))
           ),
           updated_at = now()
     where id = rec.product_id
       and variant_stock ? rec.variant_key;
  end loop;

  return jsonb_build_object('ok', true);
end;
$$;

grant execute on function public.decrement_variant_stocks(jsonb) to service_role;

-- 3) Compensating restore (used when order creation fails after reservation)
create or replace function public.restore_variant_stocks(_items jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  rec record;
begin
  perform 1
    from public.products
   where id in (
     select distinct (item->>'product_id')::uuid
     from jsonb_array_elements(_items) item
   )
   order by id
   for update;

  for rec in
    select (item->>'product_id')::uuid as product_id,
           nullif(item->>'variant_key','') as variant_key,
           (item->>'qty')::int as qty
      from jsonb_array_elements(_items) item
  loop
    if rec.variant_key is null then continue; end if;
    update public.products
       set variant_stock = jsonb_set(
             coalesce(variant_stock, '{}'::jsonb),
             array[rec.variant_key],
             to_jsonb(
               coalesce((variant_stock->>rec.variant_key)::int, 0) + rec.qty
             )
           ),
           updated_at = now()
     where id = rec.product_id
       and variant_stock ? rec.variant_key;
  end loop;
end;
$$;

grant execute on function public.restore_variant_stocks(jsonb) to service_role;
