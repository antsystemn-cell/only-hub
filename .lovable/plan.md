
# Only — Multi-Merchant E-Commerce Platform (Phase 1)

A unified Mongolian super-platform where multiple merchants run their own stores under one roof. Platform earns auto-deducted commission per confirmed payment.

## 1. Backend (Lovable Cloud)

### Storage buckets
- `merchant-logos` (public)
- `product-images` (public) — optimized WebP, 1200px main + 200px thumbnail uploaded client-side
- `banners` (public)
- `brand-logos` (public)

### Database schema (all tables RLS-enabled, every query scoped by `merchant_id`)
- `merchants`, `products`, `orders`, `categories`, `brands`, `delivery_options`, `payment_providers`, `promo_banners`, `merchant_users`, `platform_transactions` — exactly per spec.
- Add `app_role` enum: `platform_admin`, `merchant_owner`, `merchant_admin`, `merchant_moderator`, `merchant_driver`.
- Separate `user_roles` table (`user_id`, `role`, optional `merchant_id`) with `has_role()` security-definer function — used for super admin checks and to avoid recursive RLS.
- Encrypted credential storage in `payment_providers.credentials` (jsonb) using a server-side key (never returned to client; only a "configured ✓" boolean exposed).

### Triggers / server logic
- `set_order_ref()` trigger: auto-generate `external_ref` = `{2-letter merchant code}-{YYMMDD}-{NNN}` on insert.
- `apply_commission()` trigger: when `payment_status` transitions to `confirmed`, snapshot `platform_commission_rate` + `platform_commission_amount` on the order and insert a `platform_transactions` row (idempotent).
- `update_updated_at` triggers on relevant tables.

### RLS rules (summary)
- Merchant tables: read/write only if `has_merchant_access(auth.uid(), merchant_id)`.
- Public read: `merchants` (active), `products` (active), `categories`, `brands`, `delivery_options` (active), `payment_providers` (active, no credentials), `promo_banners` (active).
- `orders` insert: allowed for guests + authed customers; read restricted to merchant staff + the buyer.
- `platform_transactions`: only `platform_admin` can read.

## 2. Auth & Roles

- Email/password + Google sign-in via Lovable Cloud.
- `/merchant/register`: creates auth user → `merchants` row → `user_roles` (merchant_owner) in one transaction (server function).
- Route guards via TanStack `_authenticated` + `_merchant` + `_admin` layout routes; `beforeLoad` checks role via `has_role()`.
- First platform_admin seeded by SQL (we'll provide instructions).

## 3. Public-facing site

- `/` — Landing: hero, featured merchants grid, featured products, platform pitch.
- `/stores` — Browse all active merchants (search, category filter).
- `/store/:merchantSlug` — Storefront: merchant banners, categories, products grid.
- `/store/:merchantSlug/product/:slug` — PDP: gallery, color/size variants pulling from `variant_stock`, specs, detail media, add-to-cart.
- Cart (local storage, per merchant) + Checkout: guest or authed, address, delivery option select, payment provider select → triggers QPay invoice flow.

## 4. Merchant Dashboard `/merchant/dashboard`

Sidebar (256px desktop, horizontal scroll tab bar mobile). Sub-routes for each tab so URLs are shareable.

### Stats (`/dashboard`)
Metric cards (products, orders, gross revenue, **net revenue after commission**, customers). Recharts: monthly revenue bar (6mo), top-5 products, status distribution, category pie. Today / 7-day / AOV blocks. Commission deducted clearly displayed.

### Products (`/dashboard/products`)
Search, category filter, table (desktop) / cards (mobile). Inline form with: image upload (client WebP + thumbnail to storage), gallery, name/price/discount, category/brand selects, SKU, slug auto-gen (Cyrillic→Latin transliteration helper), description, dynamic specs key-value, detail media (image/video + caption), color variants (name + image + SKU), sizes, variant stock grid, badge toggles. Actions: view, edit, duplicate, delete (confirm).

### Orders (`/dashboard/orders`)
- Manual order modal with all 6 sections specified (incl. PDF item-list download).
- Bulk actions bar: select-all, Excel export, PDF labels (70x80mm), Print table, Niimbot label export, print column toggles.
- Filterable list, color-coded status badges, expandable details with inline item edit, save items, status dropdown, "Send to delivery" (calls `hurgelt.only.mn` API via server function — credentials per merchant).
- Recently cancelled collapsible (last 5, restore + delete).

### Users (`/dashboard/users`)
Customer list aggregated from orders (phone, name, total orders, lifetime value, last order).

### AI Chatbot (`/dashboard/chatbot`)
Settings stub: enable toggle, system prompt, knowledge sources. (Functional Q&A wiring is a fast-follow; UI + persistence ships now.)

### Settings (`/dashboard/settings/*`)
Sub-tabs: Categories, Brands, Delivery, Payments, Banners — full CRUD with the exact fields listed in the brief, including encrypted credential fields per provider type and a "Test connection" button (real check for QPay; stub for others).

## 5. QPay Integration (real)

- Credentials per merchant stored encrypted in `payment_providers.credentials` (`invoice_code`, `username`, `password`).
- Server route `/api/public/qpay/webhook` — signature/callback verified, updates `orders.payment_status='confirmed'` (commission trigger fires).
- Server function `createQpayInvoice(orderId)` — fetches token, creates invoice, returns QR + deep links, stores `qpay_invoice_id` on the order.
- Server function `testQpayConnection(merchantId)` — used by Settings Test button.
- Checkout flow: place order (status `pending`) → call `createQpayInvoice` → show QR modal → poll order until webhook flips status.

## 6. Super Admin `/admin`

Guard: `has_role('platform_admin')`. Pages:
- Merchants table (name, slug, commission %, orders, GMV, net commission, active toggle, edit commission rate inline).
- Platform transactions list + totals.
- Platform-wide stats: total orders, GMV, total commission earned, active merchants.

## 7. Design system

- Tokens defined in `src/styles.css` (oklch). Light + dark theme.
- Status colors as semantic tokens: `--status-pending` (amber), `--status-confirmed` (emerald), `--status-preparing` (blue), `--status-delivering` (violet), `--status-completed` (green), `--status-cancelled` (red).
- Rounded-2xl cards, `border-border`, sonner toasts everywhere, skeletons on loads, AlertDialog on destructive actions.
- All UI strings in Mongolian.

## 8. Tech / structure notes (technical)

- TanStack Start file-routes: `src/routes/{index,stores,store.$merchantSlug,store.$merchantSlug.product.$slug,merchant.login,merchant.register,_merchant,_merchant.dashboard,_merchant.dashboard.products,...,_admin,_admin.index,api/public/qpay/webhook}.tsx`.
- Server functions colocated as `*.functions.ts` in `src/lib/` (orders, products, qpay, delivery, admin).
- Image optimization helper in `src/lib/image.ts` (canvas-based WebP + thumbnail) — uploads to Storage, NOT base64.
- `recharts`, `xlsx`, `jspdf`, `qrcode` packages added.
- Multi-tenancy enforced both in RLS and at server-function level (every query filtered by the caller's `merchant_id` resolved from `user_roles`).

## 9. Manual user steps

1. After build, run a one-line SQL to grant yourself `platform_admin`.
2. Each merchant must paste their own QPay credentials in Settings → Payments before live checkout works.
3. `hurgelt.only.mn` API key per merchant entered in Delivery settings.

## 10. Out of scope for Phase 1 (explicitly)

- StorePay / HiPay live integration (UI + storage only, marked "Удахгүй").
- Actual AI chatbot conversation runtime (settings ship; runtime later).
- Email/SMS notifications.
- Refund flows.

---

This is a large build and will be implemented in tracked stages: (1) schema + auth + roles + storage, (2) merchant dashboard shell + Settings, (3) Products + Orders, (4) Storefront + cart + checkout, (5) QPay + commission triggers, (6) Super admin, (7) Stats charts + polish.
