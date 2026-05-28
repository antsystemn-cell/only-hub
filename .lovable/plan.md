# Only Hub — Marketplace + Delivery интеграцийн төлөвлөгөө

Энэ бол том хүсэлт. Бүгдийг нэг дор хийвэл одоо ажиллаж байгаа auth, RLS, захиалга, төлбөр, мерчант dashboard эвдэрнэ. Тиймээс **үе шаттайгаар, одоо байгаа бүтцийг дээд зэргээр ашиглаж** хийе.

## Одоо байгаа зүйлс (давхар хийхгүйн тулд)

Шалгалтын дүнд **их хэсэг нь аль хэдийн бэлэн**:

- `merchants` (= stores), `user_roles` (owner/admin/moderator/driver), `merchant_users`
- `products` (variant_stock, sizes, colors, gallery), `categories`, `brands`
- `orders` (items jsonb-ээр, payment_status, status, delivery_status, delivery_order_id, commission, qpay, external_ref)
- `platform_transactions` (commission tracking, trigger-тэй)
- `coupons`, `delivery_options`, `payment_providers`, `chatbot_settings`, `platform_banners`, `blog_posts`
- `delivery_webhooks` (event log), merchants дээр `delivery_api_key/endpoint/webhook_secret`
- Server functions: `delivery.functions.ts` (sendOrderToDelivery), `api.public.delivery.webhook.ts`, qpay webhook, orders, payments, staff, admin-merchant, admin-users
- UI: stores, store/$slug, cart, checkout, order confirmation, merchant dashboard (orders/products/settings/staff/users/chatbot), admin (merchants/orders/users/banners/blog/analytics), login/register, account
- RLS: бүх хүснэгтэд тохируулсан, role-based has_merchant_access / is_platform_admin

Тэгэхээр **шинээр `stores`, `store_members`, `order_items`, `payments`, `delivery_requests`, `seller_payouts` хүснэгт үүсгэх шаардлагагүй** — нэр өөр ч ижил функцтэй хүснэгтүүд аль хэдийн байна. Шинэ давхарлалт нэмбэл RLS, type, одоогийн UI бүгд эвдэрнэ.

## Юу үнэхээр дутуу байна

1. **`delivery_requests` + `delivery_status_history`** — одоо `orders.delivery_status` талбар л байна, түүх хадгалдаггүй (зөвхөн `delivery_webhooks` raw log). Lifecycle (`pending → requested → assigned → picked_up → in_transit → delivered → failed/cancelled`) дүрсэлсэн status table хэрэгтэй.
2. **Local delivery mode** — одоо зөвхөн external Swift API руу POST хийдэг. `VITE_DELIVERY_MODE=local` үед өөрийн систем дотроо driver-аар явуулдаг flow байхгүй.
3. **Customer-д захиалгын tracking хуудас** — `/store/$slug/order/$id` бий ч timeline (status history) харуулдаггүй.
4. **Хэрэглэгчийн "Миний захиалгууд"** — `account.tsx` дээр захиалгын жагсаалт байхгүй.
5. **Admin delivery harах/гар удирдах** — admin-д бүх delivery request-ийн жагсаалт, status гараар солих UI байхгүй.
6. **Driver role** — `merchant_driver` enum бий ч driver-д зориулсан UI/route байхгүй.
7. **Excel export** — admin orders дээр байхгүй.
8. **Migration талбарууд** — `source_system`, `source_order_id`, `source_product_id`, `legacy_metadata` талбар байхгүй.
9. **Delivery fee rules** — одоо merchant болгон `delivery_options` дотроо тогтсон үнэтэй. Платформ түвшний дүрэм байхгүй.

## Үе шаттай хэрэгжүүлэлт

### Phase 1 — Schema-ийн нэмэлт (нэг migration)

`orders`-ыг **хадгалж**, дараах зүйлсийг **нэмж** оруулна:

- `delivery_requests` хүснэгт: `id, order_id, merchant_id, mode ('local'|'external'), provider, external_ref, status, driver_id, pickup_address, dropoff_address, recipient_name, recipient_phone, fee, package_info jsonb, requested_at, picked_up_at, delivered_at, cancelled_at, last_error, created_at, updated_at` + RLS (staff: merchant_access, customer: own order, driver: assigned, admin: all) + GRANTs
- `delivery_status_history`: `id, delivery_request_id, status, note, changed_by, created_at` + RLS + GRANTs
- `orders`-д нэмэх: `source_system text default 'native'`, `source_order_id text`, `legacy_metadata jsonb default '{}'`
- `products`-д нэмэх: `source_system, source_product_id, legacy_metadata`
- `platform_settings` (хэрэв байхгүй бол): `key text primary key, value jsonb, updated_at` — delivery fee rules, default commission г.м. (admin only)
- `delivery_webhooks` дээр `delivery_request_id` FK нэмэх

Trigger: delivery_request status солигдоход `delivery_status_history`-д бичих + `orders.delivery_status`-ийг sync хийх.

### Phase 2 — Delivery service модуль

`src/lib/delivery/` дотор:
- `delivery.service.ts` — нэгдсэн API: `createDeliveryRequest`, `calculateDeliveryFee`, `updateDeliveryStatus`, `syncDeliveryStatus`, `cancelDeliveryRequest`
- `delivery.local.ts` — local mode: merchant_driver role-той user-уудад dispatch хийдэг, status-ыг гараар updateдэг
- `delivery.swift.ts` — external mode: одоо байгаа `sendOrderToDelivery` логикийг шилжүүлж, webhook дээр `delivery_request_id`-аар match хийдэг болгох
- Mode сонголт: merchant settings → `delivery_mode` ('local'|'swift'), эсвэл fallback `VITE_DELIVERY_MODE`

Одоо байгаа `delivery.functions.ts` болон `api.public.delivery.webhook.ts`-ийг **wrapper болгож** хадгална (backward compatible).

### Phase 3 — UI нэмэлтүүд

- **Merchant dashboard → Delivery tab** (`merchant.dashboard.delivery.tsx`): delivery_request-үүдийн жагсаалт, status update, driver assign (local mode), Swift mode-д tracking ref
- **Merchant orders дээр** delivery timeline бяцхан виджет
- **Admin → Delivery** (`admin.delivery.tsx`): бүх delivery_request, гараар status өөрчлөх, filter (merchant, status, огноо), Excel export
- **Admin → Orders** дээр Excel export товч (xlsx эсвэл CSV)
- **Admin → Settings** (`admin.settings.tsx`): platform commission default, delivery fee rules (жинг/зайнаас, бүсчилсэн үнэ)
- **Customer order tracking** (`store.$slug.order.$id` шинэчилнэ): timeline (Захиалга үүсэв → Төлбөр → Бэлдэж байна → Хүргэлт хүсэв → Авлаа → Замдаа → Хүргэгдсэн) — `delivery_status_history`-аас уншиж realtime subscribe
- **Account → Миний захиалгууд** (`account.orders.tsx`): нэвтэрсэн user-ийн захиалгын жагсаалт + tracking руу холбоос
- **Driver dashboard** (`driver.tsx`): merchant_driver role-той user-д зориулж assigned delivery, status солих (Авсан / Хүргэсэн / Амжилтгүй)

### Phase 4 — RLS audit + Security

- Шинэ хүснэгтүүдэд RLS бичих (дээрх migration-д орсон)
- `delivery_requests`-д customer (`order.user_id = auth.uid()`) болон driver (`driver_id = auth.uid()`) read policy
- Service role key зөвхөн server function/route дотор ашиглагдаж байгааг шалгах (одоо зөв байгаа, дахин audit)

### Phase 5 — Чанарын шалгалт

- Build TypeScript шалгалт (харагдсан алдаа байвал засна)
- Manual smoke: захиалга үүсгэх → төлөх → delivery request үүсэх → status шинэчлэгдэх → customer-д харагдах
- RLS тест: customer өөр merchant-ийн delivery харахгүй, driver зөвхөн assigned-ыг харна

## Технологи дэлгэрэнгүй

- TanStack server functions ашиглана (Edge Function нэмэхгүй) — `src/lib/delivery/*.functions.ts`
- Realtime: `delivery_requests` болон `delivery_status_history` хүснэгтийг `supabase_realtime` publication-д нэмнэ → customer tracking хуудас live update
- Excel export: `xlsx` package-аар (bun add)
- Бүх UI Mongolian, mobile-first (одоогийн style ашиглана)
- Color/token: `src/styles.css` semantic token-уудыг ашиглана, шинэ hex нэмэхгүй

## Хамрахгүй зүйлс (одоогоор)

- Easyshop / Homestore real data migration script — зөвхөн **талбар бэлдэх** (source_*, legacy_metadata). Бодит import-ыг тусдаа task болгож хийнэ.
- Swift Delivery Hub өөр project-ийн API key/endpoint — VITE env name-ыг бэлдэх, бодит холболтыг та API key өгөхөд хийнэ.
- Payout (`seller_payouts`) бүрэн UI — `platform_transactions` аль хэдийн commission tracking хийж байгаа. Payout UI дараагийн phase-д.

## Файлын жагсаалт (Phase 1-3-т хийгдэх)

**Migration (1):** `supabase/migrations/..._marketplace_delivery_core.sql`

**Server functions:**
- `src/lib/delivery/delivery.service.ts`
- `src/lib/delivery/delivery.local.ts`
- `src/lib/delivery/delivery.swift.ts`
- `src/lib/delivery/delivery.functions.ts` (createServerFn wrapper-ууд)
- `src/lib/admin-delivery.functions.ts`
- `src/lib/account-orders.functions.ts`
- `src/lib/driver.functions.ts`
- `src/lib/admin-settings.functions.ts`
- `src/lib/export.functions.ts` (xlsx generator)

**Routes:**
- `src/routes/merchant.dashboard.delivery.tsx`
- `src/routes/admin.delivery.tsx`
- `src/routes/admin.settings.tsx`
- `src/routes/account.orders.tsx`
- `src/routes/driver.tsx`
- засагдах: `src/routes/store.$merchantSlug.order.$orderId.tsx` (timeline), `src/routes/account.tsx` (захиалгын линк), `src/routes/admin.orders.tsx` (export), `src/routes/admin.tsx` & `merchant.dashboard.tsx` (nav-д шинэ link), одоогийн `delivery.functions.ts` & webhook (wrapper болгох)

**Components:**
- `src/components/DeliveryTimeline.tsx`
- `src/components/DeliveryStatusBadge.tsx`

## Дараах асуулт — тантай тохирох

Энэ маш том ажил. **3-4 turn** болгож хувааж хийсэн нь зөв:

- **Turn 1 (одоо):** Phase 1 migration + Phase 2 delivery service модуль (local + swift mode)
- **Turn 2:** Phase 3 — merchant/admin/customer/driver UI
- **Turn 3:** Excel export, platform_settings UI, RLS audit, smoke test

Хэрэв зөвшөөрвөл **Turn 1**-ээс эхэлж migration-ийг та зөвшөөрсний дараа код руу орно. Та "ok" гэж бичсэн л бол үргэлжлүүлнэ. Эсвэл өөр scope-той хүсэлт байвал хэлээрэй (ж.нь "delivery_requests хүснэгт хэрэггүй, орон зайг нь `orders` дотор үлдээ", "Excel оронд CSV хангалттай", "driver dashboard хэрэггүй" гэх мэт).
