# Poizon Korea Availability + Scheduled Sync

Scope is large. I'll deliver it in 4 implementation phases inside one work session, each phase fully shippable. Confirm and I start with Phase 1.

## Phase 1 — Parser: option-price-based availability

**File:** `src/lib/foreign-orders/providers/poizon-korea.server.ts` + `types.ts`

- Add availability enum `AVAILABLE | LOW_STOCK | UNAVAILABLE | UNKNOWN | NEEDS_REVIEW`.
- Extend `ParsedVariant` with: `availabilityStatus`, `isPurchasable`, `unavailableReason`, `sourceAvailabilityRawText`, `lastAvailabilitySyncAt`, `optionSignature`.
- New extraction layer **after** `__NEXT_DATA__` JSON pass: walk SKU list, classify by `status` + `price.minUnitVal`:
  - valid KRW > 0 + status==1 → `AVAILABLE`, purchasable
  - status != 1 OR price missing/zero → `UNAVAILABLE` (`POIZON_OPTION_PRICE_MISSING`)
  - SKU absent from `propertyMap` combination → `UNKNOWN`
- Add **HTML option-block fallback** for when JSON SKU list misses rows. Scan between option-group labels (`에디션|사이즈|용량|스타일|박스|색상|컬러|옵션|구성`) and stop markers (`배송 선택|구매|DELIVERY|EASY RETURN|관련 브랜드`). Inside block:
  - valid price regex `\b\d{1,3}(,\d{3})*원\b` → AVAILABLE
  - `--\s*원` → UNAVAILABLE
  - blacklist `구매 …원`, `… 할인`, delivery fees, `거래|만|천` transaction counts
- Detect `품절 임박` → product-level `lowStockWarning = true`; do NOT flip variants to unavailable.
- Build stable `optionSignature` per variant (`size:KR 295|box:블랙 박스`, normalized).
- Add diagnostics: `optionBlockFound`, `unavailableMarkersFound`, `lowStockMarkerFound`, `variantsAvailable|Unavailable|Unknown`.
- Add warnings when full combination matrix can't be reconstructed.

## Phase 2 — Persistence + import/preview UI

- **Migration** — extend `product_variants`:
  - `source_availability_status text`, `is_purchasable bool default true`,
  - `unavailable_reason text`, `source_availability_raw_text text`,
  - `last_availability_sync_at timestamptz`, `last_price_sync_at timestamptz`,
  - `previous_source_price int`, `price_review_required bool default false`,
  - `manual_availability_override bool default false`,
  - `manual_availability_status text`, `manual_override_reason text`,
  - `manual_override_by uuid`, `manual_override_at timestamptz`,
  - `option_signature text` (indexed per product).
- Extend `products`:
  - `sync_enabled bool default true`, `sync_frequency_hours int default 24`,
  - `next_sync_at timestamptz`, `last_source_sync_at`, `source_sync_status`, `source_sync_error`,
  - `low_stock_warning bool default false`.
- Extend `merchant_foreign_source_settings`:
  - `price_sync_mode text default 'REVIEW_BEFORE_UPDATE'` (`AUTO_UPDATE_CUSTOMER_PRICE|REVIEW_BEFORE_UPDATE|AVAILABILITY_ONLY`),
  - `checkout_freshness_required_hours int default 6`,
  - `default_sync_frequency_hours int default 24`.
- New table `foreign_source_sync_jobs` with all fields listed in spec + RLS + grants.
- **Importer UI** (`ForeignProductImporter.tsx`): variant table with columns Option / KRW / Availability badge / Purchasable / MNT / Warning. Uncheck unavailable variants from "publish selected" by default. Confirmation dialog when toggling unavailable → purchasable (requires `foreign_product_price_manage`/`publish`).
- Save `option_signature` on import.

## Phase 3 — Customer storefront + cart/checkout enforcement

- Product detail page: read variant `availability_status` + `is_purchasable`; render disabled options with `Түр дууссан` / `Үлдэгдэл бага` / `Шалгах шаардлагатай` labels. Disable Add to Cart / Buy Now for non-purchasable.
- **Backend enforcement** in `addToCart` / `createOrder` / `confirmOrderPayment` server functions: re-check `is_purchasable && availability_status in ('AVAILABLE','LOW_STOCK')` and product/merchant active.
- Cart freshness check before payment: if `last_availability_sync_at` older than merchant `checkout_freshness_required_hours`, trigger inline re-sync for those variants; block payment on UNAVAILABLE/UNKNOWN with Mongolian message from spec.
- Price-change handling per merchant `price_sync_mode`.

## Phase 4 — Scheduled sync, dashboard, notifications

- Server function `runForeignSourceSync(productId)` — fetches, parses, matches by `option_signature`, updates variants (UNKNOWN for disappeared rows, UNAVAILABLE for `--원`, new rows hidden + flagged), recomputes MNT prices via existing pricing engine, writes `foreign_source_sync_jobs` row, sets `next_sync_at`.
- **Cron endpoint** `src/routes/api.public.hooks.foreign-source-sync.ts` (apikey-protected): picks due products (`syncEnabled && nextSyncAt <= now`), processes batch (cap ~20), respects featured/orders-last-7d priority for shorter intervals.
- `pg_cron` job hourly via supabase insert tool.
- Notifications: insert into `notifications_log` on AVAILABLE↔UNAVAILABLE / LOW_STOCK transitions and repeated sync failure.
- **Sync dashboard** `src/routes/merchant.dashboard.foreign-sync.tsx`: per-product status, last/next sync, counts, actions (Re-check now / Approve price update / Pause / View log). Admin variant at `src/routes/admin.foreign-sync.tsx`.
- Product edit page: "Poizon Korea дээр дахин шалгах" button calling the same server fn.

## Acceptance verification

Test all 3 URLs against parser unit test (`pricing.test.ts` style) asserting:
- NB sneakers: KR 295/320/340 → UNAVAILABLE; others AVAILABLE; product `low_stock_warning=true` if `품절 임박` present.
- Gucci sunglasses: `블랙 박스` UNAVAILABLE, other boxes AVAILABLE w/ correct KRW.
- Gucci perfume: 3 box rows AVAILABLE w/ exact prices 90810 / 100920 / 102720.

## Notes / non-goals

- Reuses existing pricing engine (`src/lib/foreign-orders/pricing.ts`) — no formula changes.
- Existing paid orders untouched (sync writes to variant rows, not `orders` snapshots).
- Mixed cart, ready-stock flow unchanged.

Reply **"эхэл"** to start Phase 1, or tell me to adjust scope / merge phases.
