# Only Hub → Easyshop-style Commerce Upgrade

## Scope rules
- Reuse existing routes/components/Supabase tables. No replatforming.
- Mongolian UI strings, mobile-first, no extra animations.
- Keep current auth, RLS, admin, delivery integration intact.

## 1. Shipping & bundle engine (new shared module)

Add `src/lib/shipping/shipping.engine.ts` — pure functions, no I/O:
- `calculateCartShipping(cart, merchantsMap, rules, campaigns)` returns per-merchant `{ subtotal, deliveryFee, freeShippingThreshold, amountToFree, appliedRule, appliedCampaigns[] }`.
- Inputs come from existing tables + two new ones:
  - `shipping_rules` (per-merchant): `merchant_id`, `base_fee`, `free_threshold`, `express_fee`, `express_threshold`, `weekend_free`, `is_active`.
  - `bundle_campaigns` (per-merchant or platform): `id`, `merchant_id` (nullable = platform), `name`, `type` (`free_shipping_qty` | `free_shipping_amount` | `percent_discount` | `weekend_free`), `min_qty`, `min_amount`, `discount_percent`, `starts_at`, `ends_at`, `product_ids jsonb`, `category` text, `is_active`.
- Migration: create both tables with GRANT + RLS (public read active; merchant staff manage own; platform admin manage all). Seed sensible defaults via `platform_settings` already present (`default_delivery_fee`, `delivery_fee_rules`) as fallback when no row exists — no new defaults required.

## 2. Smart cart (`src/lib/cart.ts` + UI)

Extend (don't rewrite) `src/lib/cart.ts`:
- Keep current localStorage shape; add `groupByMerchant(items)` and `useCartSummary()` hook that calls `shipping.engine` against cached merchants/rules (React Query, 5 min stale).
- New `src/components/cart/StickyCartBar.tsx` — fixed-bottom mobile bar shown on store, product, cart pages: total + "Сагсанд (N)" + free-shipping progress (`Үнэгүй хүргэлт хүртэл 15,000₮`).
- New `src/components/cart/FreeShippingProgress.tsx` — progress bar; reused in cart page and sticky bar.
- Update `store.$merchantSlug.cart.tsx`:
  - Group items by merchant when multi-store (single-store stays as today).
  - Per-group: subtotal, delivery fee preview, free-shipping progress, applied campaign chip.
  - Quantity stepper buttons sized for thumb (h-10 w-10), optimistic updates.
- Update product page: "Сагсанд нэмэх" remains; add small "+{amount}₮ нэмбэл үнэгүй хүргэлт" hint when within threshold.

## 3. Checkout — 3 mobile steps (replace current single-form)

Rewrite `store.$merchantSlug.checkout.tsx` as stepper:
1. **Хүлээн авагч**: name, phone, district (select: дүүрэг), address, note.
2. **Хүргэлт**: radio cards (Энгийн / Шуурхай / Авч очих — pickup disabled-stub), uses rule-engine fee; show free-shipping applied badge.
3. **Төлбөр**: QPay (default), StorePay, Pocket, Cash on delivery — render existing payment_providers + COD toggle from merchant setting.
4. Confirm screen reuses existing `order.$orderId` route.

UX: sticky bottom "Үргэлжлүүлэх" button, persistent compact order summary collapsible at top, large inputs (h-12), `inputMode="tel"` for phone, autocomplete attrs. Validate with zod; show inline errors in Mongolian.

## 4. Multi-store checkout

If cart spans merchants, split into **one order per merchant** at submit (loop existing `createOrder` server fn). Show "Танай захиалга 2 дэлгүүрт хуваагдана" notice. Each gets its own QPay invoice; confirmation page lists all created orders.

## 5. Admin order management upgrades

In `admin.orders.tsx` and `merchant.dashboard.orders.tsx`:
- Add row checkboxes + bulk-action bar: **Төлөв өөрчлөх**, **Хүргэлт үүсгэх**, **Төлсөн гэж тэмдэглэх**, **Excel татах**.
- Quick status dropdown inline on each row (no modal).
- Quick "Хүргэгч оноох" select for `merchant_driver` users.
- "Залгах" button → `tel:`, "Мессеж" → SMS link with prefilled Mongolian text.
- Reuse existing CSV export; add proper Excel via `xlsx` (already needed). `bun add xlsx`.
- Print-label view: new route `/merchant/dashboard/orders/print?ids=...` — A6 label HTML, browser print.

New server fns in `src/lib/orders.functions.ts`:
- `bulkUpdateOrderStatus({ ids, status })`
- `bulkMarkPaid({ ids })`
- `bulkCreateDelivery({ ids })`
- `bulkAssignDriver({ ids, driverId })`

## 6. Delivery auto-hand-off (already partial)

- Confirm QPay webhook already calls `createDeliveryRequest` ✓.
- Add same call to: admin "Төлсөн гэж тэмдэглэх" bulk action, and on order status → `confirmed` (server-side trigger in `bulkUpdateOrderStatus`).
- Statuses mapping kept as in current trigger `tg_delivery_request_history`.

## 7. Merchant shipping/campaign settings UI

New tab in `merchant.dashboard.settings.tsx` → "Хүргэлт ба урамшуулал":
- Free-shipping threshold, base fee, express fee (writes `shipping_rules`).
- List of bundle_campaigns with create/edit dialog (type, min_qty/amount, dates, product picker).
- Weekend free shipping toggle.

Platform admin gets same UI under `admin.settings.tsx` for platform-wide campaigns (merchant_id null).

## 8. Performance

- React Query everywhere; `staleTime: 60_000` for products/merchants/rules.
- Skeleton loaders on cart, checkout, orders list (use existing `Skeleton` from ui).
- Debounce search inputs 250ms (already lodash-free — write inline `useDebounce`).
- Image `loading="lazy" decoding="async"` audit on product cards.

## 9. Validation checklist (manual, after build)
- [ ] Add to cart from product + quick view
- [ ] Free-shipping progress updates live
- [ ] Multi-store cart splits orders on submit
- [ ] 3-step checkout on 411px viewport (current device)
- [ ] QPay flow → order → auto delivery_request created
- [ ] Admin bulk status + bulk delivery
- [ ] Excel export opens in Excel
- [ ] Driver dashboard receives assignment

## Files to create
```
src/lib/shipping/shipping.engine.ts
src/lib/shipping/shipping.functions.ts
src/lib/shipping/shipping.types.ts
src/components/cart/StickyCartBar.tsx
src/components/cart/FreeShippingProgress.tsx
src/components/cart/CartGroup.tsx
src/components/checkout/CheckoutStepper.tsx
src/components/checkout/StepCustomer.tsx
src/components/checkout/StepDelivery.tsx
src/components/checkout/StepPayment.tsx
src/components/admin/BulkActionBar.tsx
src/components/admin/CampaignDialog.tsx
src/routes/merchant.dashboard.orders.print.tsx
supabase/migrations/<ts>_shipping_rules_and_campaigns.sql
```

## Files to edit
```
src/lib/cart.ts                       (add grouping + hook)
src/lib/orders.functions.ts           (bulk fns + multi-store create)
src/routes/store.$merchantSlug.cart.tsx
src/routes/store.$merchantSlug.checkout.tsx
src/routes/store.$merchantSlug.product.$productSlug.tsx
src/routes/store.$merchantSlug.tsx    (sticky bar slot)
src/routes/admin.orders.tsx
src/routes/merchant.dashboard.orders.tsx
src/routes/merchant.dashboard.settings.tsx
src/routes/admin.settings.tsx
```

## Out of scope (explicit)
- Pickup point logic (UI stub only, disabled).
- Real SMS / call-center integration.
- New design system / animations.
- Loyalty points, wallet, reviews.

Approve to start; I'll execute in this order: migration → engine → cart UI → checkout → admin bulk → settings → validation.
