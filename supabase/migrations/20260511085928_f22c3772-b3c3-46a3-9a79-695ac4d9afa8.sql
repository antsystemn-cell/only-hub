
create table public.coupons (
  id uuid primary key default gen_random_uuid(),
  merchant_id uuid not null references public.merchants(id) on delete cascade,
  code text not null,
  discount_type text not null check (discount_type in ('percent','fixed')),
  discount_value numeric not null check (discount_value >= 0),
  min_order numeric not null default 0,
  max_uses integer,
  used_count integer not null default 0,
  expires_at timestamptz,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (merchant_id, code)
);

create index idx_coupons_merchant_code on public.coupons(merchant_id, code);

alter table public.coupons enable row level security;

create policy "coupons public read active"
  on public.coupons for select
  using (is_active = true or has_merchant_access(auth.uid(), merchant_id));

create policy "coupons staff manage"
  on public.coupons for all
  using (has_merchant_access(auth.uid(), merchant_id))
  with check (has_merchant_access(auth.uid(), merchant_id));

create trigger coupons_set_updated_at
  before update on public.coupons
  for each row execute function public.tg_set_updated_at();

-- Realtime
alter table public.products replica identity full;
alter table public.orders replica identity full;
alter table public.coupons replica identity full;

do $$ begin
  begin
    alter publication supabase_realtime add table public.products;
  exception when duplicate_object then null; end;
  begin
    alter publication supabase_realtime add table public.orders;
  exception when duplicate_object then null; end;
  begin
    alter publication supabase_realtime add table public.coupons;
  exception when duplicate_object then null; end;
end $$;
