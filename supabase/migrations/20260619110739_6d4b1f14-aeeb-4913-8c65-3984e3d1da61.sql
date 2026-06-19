-- ============================================
-- product_variants: availability + override fields
-- ============================================
alter table public.product_variants
  add column if not exists source_availability_status text,
  add column if not exists is_purchasable boolean not null default true,
  add column if not exists unavailable_reason text,
  add column if not exists source_availability_raw_text text,
  add column if not exists last_availability_sync_at timestamptz,
  add column if not exists last_price_sync_at timestamptz,
  add column if not exists previous_source_price integer,
  add column if not exists price_review_required boolean not null default false,
  add column if not exists manual_availability_override boolean not null default false,
  add column if not exists manual_availability_status text,
  add column if not exists manual_override_reason text,
  add column if not exists manual_override_by uuid,
  add column if not exists manual_override_at timestamptz,
  add column if not exists option_signature text;

create index if not exists product_variants_option_signature_idx
  on public.product_variants (product_id, option_signature);
create index if not exists product_variants_purchasable_idx
  on public.product_variants (product_id) where is_purchasable = true;

-- ============================================
-- products: sync scheduling
-- ============================================
alter table public.products
  add column if not exists sync_enabled boolean not null default true,
  add column if not exists sync_frequency_hours integer not null default 24,
  add column if not exists next_sync_at timestamptz,
  add column if not exists last_source_sync_at timestamptz,
  add column if not exists source_sync_status text,
  add column if not exists source_sync_error text,
  add column if not exists low_stock_warning boolean not null default false,
  add column if not exists sync_failure_count integer not null default 0;

create index if not exists products_next_sync_at_idx
  on public.products (next_sync_at)
  where sync_enabled = true and product_type = 'FOREIGN_ORDER';

-- ============================================
-- merchant_foreign_source_settings: sync policy
-- ============================================
alter table public.merchant_foreign_source_settings
  add column if not exists checkout_freshness_required_hours integer not null default 6,
  add column if not exists default_sync_frequency_hours integer not null default 24;

-- Existing column `price_sync_mode` already exists per importer code; ensure default.
-- (Set safe default if column exists but is null on rows.)
update public.merchant_foreign_source_settings
   set price_sync_mode = 'REVIEW_BEFORE_UPDATE'
 where price_sync_mode is null;

-- ============================================
-- foreign_source_sync_jobs
-- ============================================
create table if not exists public.foreign_source_sync_jobs (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  merchant_id uuid not null references public.merchants(id) on delete cascade,
  source public.foreign_source not null,
  sync_type text not null default 'PRICE_AND_AVAILABILITY',
  status text not null default 'PENDING',
  started_at timestamptz,
  finished_at timestamptz,
  error_message text,
  variants_checked integer not null default 0,
  variants_available integer not null default 0,
  variants_unavailable integer not null default 0,
  variants_unknown integer not null default 0,
  price_changes_count integer not null default 0,
  availability_changes_count integer not null default 0,
  diagnostics jsonb,
  created_at timestamptz not null default now()
);

grant select on public.foreign_source_sync_jobs to authenticated;
grant all on public.foreign_source_sync_jobs to service_role;

alter table public.foreign_source_sync_jobs enable row level security;

create policy "Merchant members can view sync jobs"
on public.foreign_source_sync_jobs
for select
to authenticated
using (
  public.has_merchant_access(auth.uid(), merchant_id)
  or public.is_platform_admin(auth.uid())
);

create index if not exists foreign_source_sync_jobs_product_idx
  on public.foreign_source_sync_jobs (product_id, created_at desc);
create index if not exists foreign_source_sync_jobs_merchant_idx
  on public.foreign_source_sync_jobs (merchant_id, created_at desc);
