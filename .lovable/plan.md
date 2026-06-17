## Public Order Tracking Portal — хэрэгжүүлэх төлөвлөгөө

### 1. DB migration
Шинэ хүснэгт `public_order_tokens`:
- `id uuid pk`, `order_id uuid unique → orders(id) on delete cascade`
- `public_token text unique not null` (32-byte base64url)
- `customer_phone text`, `expires_at timestamptz` (default now()+30d)
- `is_active boolean default true`
- `open_count int default 0`, `last_accessed_at timestamptz`
- `created_at`, `updated_at`
- RLS: staff (has_merchant_access) manage; service_role full; **NO anon policy** — токеноор public серверийн фн дамжуулж унших.
- `delivery_requests`: `tracking_sms_sent_at timestamptz` нэмэх (auto SMS-ийг 1 удаа явуулахын тулд).

### 2. Token service (server-only)
`src/lib/tracking/tracking.server.ts`:
- `getOrCreateTrackingToken(orderId)` — байхгүй бол үүсгэнэ.
- `resolveOrderByToken(token)` — токеноор аюулгүй фильтр хийсэн `OrderPublicView` буцаана (id, external_ref, items[name/qty/price], total, delivery_fee, payment_status, payment_method, delivery_status, qpay_*, merchant{name,slug,logo,phone}, driver{name,phone,vehicle}, delivery_request{status, timestamps, external_ref/tracking}, payment_request{provider, invoice_url, qr, amount}). Cost_price, user_id, internal note, supplier мэдээлэл хасна. Expire/disabled бол `expired`/`disabled` буцаана.
- `regenerateTrackingToken(orderId)` / `disableTrackingToken(orderId)`.

### 3. Server functions
`src/lib/tracking/tracking.functions.ts`:
- `getPublicOrderByTokenFn` — public (no auth), 1 sec cache, увеличивает open_count + last_accessed_at, лог access.
- `regenerateTrackingTokenFn`, `disableTrackingTokenFn` — staff/admin only.
- `getTrackingLinkFn` — staff/admin: токен авч "https://only.mn/track/{token}" буцаана.

### 4. Auto SMS on driver assignment
`src/lib/tracking/tracking-notify.server.ts`:
- `sendTrackingLinkSms(orderId)`: токеноо үүсгээд, CallPro-аар тогтсон message явуулж, `delivery_requests.tracking_sms_sent_at` суулгана. Идемпотент.
- `platform_settings` key `tracking_sms_template` (default Mongolian message). Vars: `{tracking_link}`, `{order_number}`, `{merchant_name}`.

Trigger points (delivery_request status → `assigned` болсон үед):
1. `src/lib/delivery/delivery.service.ts` → `updateDeliveryStatus` (driver/staff status change)
2. `src/lib/delivery/delivery.service.ts` → `syncDeliveryStatusFromExternal` (Swift webhook)
Хоёуланд: `if next === "assigned" && prev !== "assigned"` → `sendTrackingLinkSms(orderId)` (try/catch background).

### 5. Public route `/track/$token`
`src/routes/track.$token.tsx`:
- Public route (top-level, no auth gate). `head()` with noindex.
- Loader: `getPublicOrderByTokenFn` дуудна. Expired → friendly error page. Notfound → 404.
- UI sections (reuse `DeliveryTimeline`, `PaymentIntentPanel` (read-only бол shadcn cards):
  - Header: merchant logo + name, order number, "Хүргэлтийн төлөв" badge.
  - **Order summary**: items table, subtotal, delivery_fee, total.
  - **Delivery timeline** (DeliveryTimeline компонентыг token-аас ирсэн history-р re-use).
  - **Driver card** (name, phone with `tel:` call button, vehicle) — driver_id-р profiles+merchant_users, fallback delivery_webhooks raw payload.
  - **Payment panel**:
    - `payment_status == confirmed` → green "✓ Төлбөр төлөгдсөн" + paid_at.
    - Else → "Төлбөр төлөх" button. Open inline payment intent (reuse `PaymentIntentPanel` with token-based session) OR redirect to existing `/store/{slug}/order/{id}` (per Q2 user wants both pages; the simplest secure path is reuse PaymentIntentPanel via a token-scoped server fn).
    - delivered + unpaid → дээр нь "⚠ Төлбөр хүлээгдэж байна" banner.
- Auto refresh: Supabase realtime channel `tracking:{orderId}` for orders/delivery_requests/payment_requests rows (anon publishable client subscribes by id only — RLS will block unauthorized read; instead poll every 8s via React Query refetchInterval — simpler + works without RLS changes).
- "Сүүлд шинэчилсэн" timestamp.

### 6. Payment from public page
Шинэ server fn `payByTrackingTokenFn`: token + chosen providerType → token-аар order-аа resolve хийгээд, дотроо existing payment intent service-ийг дуудна. Returns invoice/QR/redirect URL. Webhook flow (QPay/Storepay/etc.) аль хэдийн `confirmOrderPayment`-аар paid болгоно — өөрчлөх шаардлагагүй.

### 7. Admin / merchant management
`src/components/admin/TrackingLinkCard.tsx` — merchant/admin order detail дотор:
- "Tracking холбоос: …" + Copy товч
- "Шинээр үүсгэх" (regenerate)
- "Идэвхгүй болгох"
- "Хандалт: {open_count}, сүүлд: {last_accessed_at}"

`src/routes/store.$merchantSlug.order.$orderId.tsx` болон merchant/admin orders дэлгэрэнгүй дотор багц нэмнэ.

### 8. Anti-duplicate / security
- Token = `crypto.randomBytes(32).toString("base64url")`.
- `tracking_sms_sent_at` болон notifications_log-аар дамжуулан давхар SMS-ээс хамгаална.
- public response-д зөвхөн safe whitelist талбар.
- expired/disabled response: 410-similar payload, UI Mongolian мессеж.

### Файл өөрчлөлт (товчоор)
**Шинэ:**
- supabase migration: `public_order_tokens` + `delivery_requests.tracking_sms_sent_at`
- `src/lib/tracking/tracking.server.ts`
- `src/lib/tracking/tracking.functions.ts`
- `src/lib/tracking/tracking-notify.server.ts`
- `src/routes/track.$token.tsx`
- `src/components/admin/TrackingLinkCard.tsx`

**Засах:**
- `src/lib/delivery/delivery.service.ts` (assigned trigger 2 газар)
- `src/lib/payment-collection/collection.service.ts` (paid SMS-д tracking_link солих сонголт — өнөөгийн template ашигладаг)
- `src/routes/store.$merchantSlug.order.$orderId.tsx` + admin/merchant order pages (TrackingLinkCard embed)

Алхам 1–4 backend, 5–6 frontend public, 7 admin UI. Дуусахад би dev сервэр болон invoke-server-function-аар sanity test хийнэ.
