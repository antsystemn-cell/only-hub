
-- =========================================
-- Enums & roles
-- =========================================
create type public.app_role as enum (
  'platform_admin',
  'merchant_owner',
  'merchant_admin',
  'merchant_moderator',
  'merchant_driver'
);

-- =========================================
-- Merchants
-- =========================================
create table public.merchants (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text unique not null,
  logo_url text,
  description text,
  owner_id uuid references auth.users(id) on delete set null,
  is_active boolean not null default true,
  commission_rate numeric not null default 3.0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- =========================================
-- User roles (separate table; never on profiles)
-- =========================================
create table public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.app_role not null,
  merchant_id uuid references public.merchants(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (user_id, role, merchant_id)
);

-- Security-definer helpers (avoid recursive RLS)
create or replace function public.has_role(_user_id uuid, _role public.app_role)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.user_roles
    where user_id = _user_id and role = _role
  )
$$;

create or replace function public.is_platform_admin(_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.user_roles
    where user_id = _user_id and role = 'platform_admin'
  )
$$;

create or replace function public.has_merchant_access(_user_id uuid, _merchant_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.user_roles
    where user_id = _user_id
      and merchant_id = _merchant_id
      and role in ('merchant_owner','merchant_admin','merchant_moderator','merchant_driver')
  ) or public.is_platform_admin(_user_id)
$$;

-- =========================================
-- Categories / Brands
-- =========================================
create table public.categories (
  id uuid primary key default gen_random_uuid(),
  merchant_id uuid not null references public.merchants(id) on delete cascade,
  name text not null,
  icon text,
  position integer not null default 0,
  created_at timestamptz not null default now()
);

create table public.brands (
  id uuid primary key default gen_random_uuid(),
  merchant_id uuid not null references public.merchants(id) on delete cascade,
  name text not null,
  logo_url text,
  created_at timestamptz not null default now()
);

-- =========================================
-- Products
-- =========================================
create table public.products (
  id uuid primary key default gen_random_uuid(),
  merchant_id uuid not null references public.merchants(id) on delete cascade,
  name text not null,
  slug text,
  description text,
  price numeric not null,
  original_price numeric,
  discount numeric not null default 0,
  image_url text,
  thumbnail_url text,
  product_code text,
  category text,
  brand_id uuid references public.brands(id) on delete set null,
  is_new boolean not null default false,
  is_on_sale boolean not null default false,
  is_active boolean not null default true,
  colors jsonb not null default '[]'::jsonb,
  sizes jsonb not null default '[]'::jsonb,
  specifications jsonb not null default '[]'::jsonb,
  detail_media jsonb not null default '[]'::jsonb,
  stock_quantity integer not null default 0,
  variant_stock jsonb not null default '{}'::jsonb,
  sales integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on public.products(merchant_id);
create index on public.products(category);

-- =========================================
-- Delivery options
-- =========================================
create table public.delivery_options (
  id uuid primary key default gen_random_uuid(),
  merchant_id uuid not null references public.merchants(id) on delete cascade,
  name text not null,
  description text,
  price numeric not null default 0,
  estimated_days_min integer not null default 1,
  estimated_days_max integer not null default 3,
  is_active boolean not null default true,
  address text,
  phone text,
  payment_terms text,
  position integer not null default 0,
  created_at timestamptz not null default now()
);

-- =========================================
-- Payment providers (credentials encrypted/private)
-- =========================================
create table public.payment_providers (
  id uuid primary key default gen_random_uuid(),
  merchant_id uuid not null references public.merchants(id) on delete cascade,
  name text not null,
  provider_type text not null,
  logo_url text,
  icon text default '💳',
  description text,
  is_active boolean not null default true,
  credentials jsonb not null default '{}'::jsonb,
  position integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- =========================================
-- Promo banners
-- =========================================
create table public.promo_banners (
  id uuid primary key default gen_random_uuid(),
  merchant_id uuid not null references public.merchants(id) on delete cascade,
  title text not null,
  subtitle text,
  button_text text default 'Бүтээгдхүүн үзэх',
  button_link text default '/shop',
  banner_image text,
  is_active boolean not null default true,
  position integer not null default 0,
  created_at timestamptz not null default now()
);

-- =========================================
-- Orders
-- =========================================
create table public.orders (
  id uuid primary key default gen_random_uuid(),
  merchant_id uuid not null references public.merchants(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  items jsonb not null,
  total numeric not null,
  status text not null default 'pending',
  payment_method text not null default 'qpay',
  payment_status text not null default 'unpaid',
  phone text,
  guest_name text,
  shipping_address text,
  delivery_option_id uuid references public.delivery_options(id) on delete set null,
  delivery_fee numeric not null default 0,
  is_guest boolean not null default false,
  source text not null default 'web',
  source_note text,
  external_ref text,
  branch text,
  note text,
  delivery_order_id text,
  delivery_status text,
  qpay_invoice_id text,
  platform_commission_rate numeric,
  platform_commission_amount numeric,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  sale_date timestamptz default now()
);
create index on public.orders(merchant_id);
create index on public.orders(user_id);
create index on public.orders(status);
create index on public.orders(payment_status);

-- =========================================
-- Merchant users (collaborator list — role still in user_roles)
-- =========================================
create table public.merchant_users (
  id uuid primary key default gen_random_uuid(),
  merchant_id uuid not null references public.merchants(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null,
  created_at timestamptz not null default now(),
  unique (merchant_id, user_id)
);

-- =========================================
-- Platform transactions (commissions)
-- =========================================
create table public.platform_transactions (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null unique references public.orders(id) on delete cascade,
  merchant_id uuid not null references public.merchants(id) on delete cascade,
  order_total numeric not null,
  commission_rate numeric not null,
  commission_amount numeric not null,
  status text not null default 'pending',
  created_at timestamptz not null default now()
);

-- =========================================
-- Triggers: updated_at
-- =========================================
create or replace function public.tg_set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

create trigger merchants_updated_at before update on public.merchants
  for each row execute function public.tg_set_updated_at();
create trigger products_updated_at before update on public.products
  for each row execute function public.tg_set_updated_at();
create trigger orders_updated_at before update on public.orders
  for each row execute function public.tg_set_updated_at();
create trigger payment_providers_updated_at before update on public.payment_providers
  for each row execute function public.tg_set_updated_at();

-- =========================================
-- Trigger: external_ref auto-generation (STORE-YYMMDD-NNN)
-- =========================================
create or replace function public.tg_set_order_ref()
returns trigger language plpgsql as $$
declare
  store_code text;
  date_part text;
  seq_num integer;
begin
  if new.external_ref is not null and length(new.external_ref) > 0 then
    return new;
  end if;
  select upper(left(regexp_replace(coalesce(slug, name), '[^A-Za-z0-9]', '', 'g'), 2))
    into store_code from public.merchants where id = new.merchant_id;
  if store_code is null or length(store_code) = 0 then
    store_code := 'ON';
  end if;
  date_part := to_char(coalesce(new.sale_date, now()), 'YYMMDD');
  select count(*) + 1 into seq_num
    from public.orders
    where merchant_id = new.merchant_id
      and to_char(coalesce(sale_date, created_at), 'YYMMDD') = date_part;
  new.external_ref := store_code || '-' || date_part || '-' || lpad(seq_num::text, 3, '0');
  return new;
end $$;

create trigger orders_set_ref before insert on public.orders
  for each row execute function public.tg_set_order_ref();

-- =========================================
-- Trigger: commission on payment confirmed
-- =========================================
create or replace function public.tg_apply_commission()
returns trigger language plpgsql as $$
declare
  rate numeric;
  amount numeric;
begin
  if new.payment_status = 'confirmed'
     and (tg_op = 'INSERT' or old.payment_status is distinct from 'confirmed') then
    if new.platform_commission_rate is null then
      select commission_rate into rate from public.merchants where id = new.merchant_id;
      rate := coalesce(rate, 0);
      amount := round((new.total * rate / 100.0)::numeric, 2);
      new.platform_commission_rate := rate;
      new.platform_commission_amount := amount;
    end if;
  end if;
  return new;
end $$;

create trigger orders_apply_commission before insert or update on public.orders
  for each row execute function public.tg_apply_commission();

create or replace function public.tg_record_platform_transaction()
returns trigger language plpgsql as $$
begin
  if new.payment_status = 'confirmed'
     and (tg_op = 'INSERT' or old.payment_status is distinct from 'confirmed') then
    insert into public.platform_transactions
      (order_id, merchant_id, order_total, commission_rate, commission_amount, status)
    values
      (new.id, new.merchant_id, new.total,
       coalesce(new.platform_commission_rate, 0),
       coalesce(new.platform_commission_amount, 0),
       'pending')
    on conflict (order_id) do nothing;
  end if;
  return new;
end $$;

create trigger orders_record_platform_tx after insert or update on public.orders
  for each row execute function public.tg_record_platform_transaction();

-- =========================================
-- Enable RLS on everything
-- =========================================
alter table public.merchants enable row level security;
alter table public.user_roles enable row level security;
alter table public.categories enable row level security;
alter table public.brands enable row level security;
alter table public.products enable row level security;
alter table public.delivery_options enable row level security;
alter table public.payment_providers enable row level security;
alter table public.promo_banners enable row level security;
alter table public.orders enable row level security;
alter table public.merchant_users enable row level security;
alter table public.platform_transactions enable row level security;

-- =========================================
-- RLS Policies
-- =========================================

-- merchants
create policy "merchants public read active" on public.merchants
  for select using (is_active = true or public.has_merchant_access(auth.uid(), id));
create policy "merchants insert authed" on public.merchants
  for insert to authenticated with check (auth.uid() = owner_id);
create policy "merchants update by staff" on public.merchants
  for update using (public.has_merchant_access(auth.uid(), id));
create policy "merchants admin update" on public.merchants
  for all using (public.is_platform_admin(auth.uid())) with check (public.is_platform_admin(auth.uid()));

-- user_roles
create policy "user_roles self read" on public.user_roles
  for select using (auth.uid() = user_id or public.is_platform_admin(auth.uid()));
create policy "user_roles platform admin manage" on public.user_roles
  for all using (public.is_platform_admin(auth.uid())) with check (public.is_platform_admin(auth.uid()));
create policy "user_roles owner manage merchant staff" on public.user_roles
  for all using (
    merchant_id is not null
    and exists (select 1 from public.user_roles ur
      where ur.user_id = auth.uid() and ur.merchant_id = user_roles.merchant_id and ur.role = 'merchant_owner')
  ) with check (
    merchant_id is not null
    and exists (select 1 from public.user_roles ur
      where ur.user_id = auth.uid() and ur.merchant_id = user_roles.merchant_id and ur.role = 'merchant_owner')
  );

-- categories / brands / delivery_options / promo_banners — public read, staff manage
create policy "categories public read" on public.categories for select using (true);
create policy "categories staff manage" on public.categories
  for all using (public.has_merchant_access(auth.uid(), merchant_id))
  with check (public.has_merchant_access(auth.uid(), merchant_id));

create policy "brands public read" on public.brands for select using (true);
create policy "brands staff manage" on public.brands
  for all using (public.has_merchant_access(auth.uid(), merchant_id))
  with check (public.has_merchant_access(auth.uid(), merchant_id));

create policy "delivery_options public read active" on public.delivery_options
  for select using (is_active = true or public.has_merchant_access(auth.uid(), merchant_id));
create policy "delivery_options staff manage" on public.delivery_options
  for all using (public.has_merchant_access(auth.uid(), merchant_id))
  with check (public.has_merchant_access(auth.uid(), merchant_id));

create policy "promo_banners public read active" on public.promo_banners
  for select using (is_active = true or public.has_merchant_access(auth.uid(), merchant_id));
create policy "promo_banners staff manage" on public.promo_banners
  for all using (public.has_merchant_access(auth.uid(), merchant_id))
  with check (public.has_merchant_access(auth.uid(), merchant_id));

-- products
create policy "products public read active" on public.products
  for select using (is_active = true or public.has_merchant_access(auth.uid(), merchant_id));
create policy "products staff manage" on public.products
  for all using (public.has_merchant_access(auth.uid(), merchant_id))
  with check (public.has_merchant_access(auth.uid(), merchant_id));

-- payment_providers
-- public read is allowed but client code must select only safe columns; credentials column will be filtered server-side
create policy "payment_providers public read active" on public.payment_providers
  for select using (is_active = true or public.has_merchant_access(auth.uid(), merchant_id));
create policy "payment_providers staff manage" on public.payment_providers
  for all using (public.has_merchant_access(auth.uid(), merchant_id))
  with check (public.has_merchant_access(auth.uid(), merchant_id));

-- orders
create policy "orders insert anyone" on public.orders
  for insert with check (true);
create policy "orders staff read" on public.orders
  for select using (
    public.has_merchant_access(auth.uid(), merchant_id)
    or (auth.uid() is not null and auth.uid() = user_id)
  );
create policy "orders staff update" on public.orders
  for update using (public.has_merchant_access(auth.uid(), merchant_id))
  with check (public.has_merchant_access(auth.uid(), merchant_id));
create policy "orders staff delete" on public.orders
  for delete using (public.has_merchant_access(auth.uid(), merchant_id));

-- merchant_users
create policy "merchant_users staff read" on public.merchant_users
  for select using (public.has_merchant_access(auth.uid(), merchant_id));
create policy "merchant_users owner manage" on public.merchant_users
  for all using (
    exists (select 1 from public.user_roles ur
      where ur.user_id = auth.uid() and ur.merchant_id = merchant_users.merchant_id and ur.role = 'merchant_owner')
    or public.is_platform_admin(auth.uid())
  ) with check (
    exists (select 1 from public.user_roles ur
      where ur.user_id = auth.uid() and ur.merchant_id = merchant_users.merchant_id and ur.role = 'merchant_owner')
    or public.is_platform_admin(auth.uid())
  );

-- platform_transactions
create policy "platform_tx admin read" on public.platform_transactions
  for select using (
    public.is_platform_admin(auth.uid())
    or public.has_merchant_access(auth.uid(), merchant_id)
  );
create policy "platform_tx admin write" on public.platform_transactions
  for all using (public.is_platform_admin(auth.uid()))
  with check (public.is_platform_admin(auth.uid()));

-- =========================================
-- Storage buckets
-- =========================================
insert into storage.buckets (id, name, public)
values
  ('merchant-logos','merchant-logos',true),
  ('product-images','product-images',true),
  ('banners','banners',true),
  ('brand-logos','brand-logos',true)
on conflict (id) do nothing;

create policy "Public read merchant-logos" on storage.objects
  for select using (bucket_id = 'merchant-logos');
create policy "Authed write merchant-logos" on storage.objects
  for insert to authenticated with check (bucket_id = 'merchant-logos');
create policy "Authed update merchant-logos" on storage.objects
  for update to authenticated using (bucket_id = 'merchant-logos');
create policy "Authed delete merchant-logos" on storage.objects
  for delete to authenticated using (bucket_id = 'merchant-logos');

create policy "Public read product-images" on storage.objects
  for select using (bucket_id = 'product-images');
create policy "Authed write product-images" on storage.objects
  for insert to authenticated with check (bucket_id = 'product-images');
create policy "Authed update product-images" on storage.objects
  for update to authenticated using (bucket_id = 'product-images');
create policy "Authed delete product-images" on storage.objects
  for delete to authenticated using (bucket_id = 'product-images');

create policy "Public read banners" on storage.objects
  for select using (bucket_id = 'banners');
create policy "Authed write banners" on storage.objects
  for insert to authenticated with check (bucket_id = 'banners');
create policy "Authed update banners" on storage.objects
  for update to authenticated using (bucket_id = 'banners');
create policy "Authed delete banners" on storage.objects
  for delete to authenticated using (bucket_id = 'banners');

create policy "Public read brand-logos" on storage.objects
  for select using (bucket_id = 'brand-logos');
create policy "Authed write brand-logos" on storage.objects
  for insert to authenticated with check (bucket_id = 'brand-logos');
create policy "Authed update brand-logos" on storage.objects
  for update to authenticated using (bucket_id = 'brand-logos');
create policy "Authed delete brand-logos" on storage.objects
  for delete to authenticated using (bucket_id = 'brand-logos');
