## Зорилго
Only.mn merchant платформ дахь критик алдаа болон дутуу функцуудыг бүгдийг засах.

## Дараалал

### 1. DB Migration (эхэнд)
- `orders.coupon_id` (FK → coupons), `orders.coupon_discount` нэмэх
- `orders.qpay_qr_text`, `orders.qpay_short_url` нэмэх
- `chatbot_settings.merchant_id` дээр FK → merchants нэмэх

### 2. Login Race Condition засах
- **`merchant.login.tsx`**: `onSubmit` дотор `user_roles` шууд уншиж, `window.location.href`-р redirect (context state-аас хамаарахгүй)
- **`admin.tsx`**: `checking` local state нэмж, role шалгаж дуустал "Эрх шалгаж байна..." харуулах

### 3. Products хуудас — Дутуу талбарууд
`merchant.dashboard.products.tsx` form-д нэмэх:
- URL slug (auto-generate товчтой)
- `is_bogo` (1+1) toggle
- Specifications (динамик key-value)
- Colors (нэр + SKU)
- Sizes (chip + Enter-р нэмэх)
- Variant stock grid (color × size матриц)

### 4. Orders хуудас
`merchant.dashboard.orders.tsx`:
- ManualOrderDialog-д: sale_date, branch, source талбар
- ManualOrderDialog-д: бараа хайх (DB-с product search)
- OrderRow-д: "Хүргэлт рүү илгээх" жинхэнэ функц (edge function дуудлага)
- OrderRow expanded дотор: бараа inline засах товч
- Cancelled захиалга устгах AlertDialog

### 5. Settings хуудас
`merchant.dashboard.settings.tsx`:
- CrudList-д edit функц нэмэх (item дээр pencil товчоор form-д load)
- Delivery fields-г бүрэн болгох (payment_terms, estimated_days_min/max)
- is_active toggle нэмэх delivery/banner-д

### 6. Storefront
`store.$merchantSlug.tsx`:
- Promo banner carousel (auto-rotate)
- Category filter tabs (rounded chips, "Бүгд" + категориуд)

### 7. Edge Function (хэрэгцээтэй бол)
- `send-to-delivery` edge function үүсгэх (хэрэв байхгүй бол placeholder)

## Техникийн анхаарах зүйлс
- Бүх UI текст монголоор үлдэнэ
- Семантик дизайн токен ашиглах
- `useServerFn` (testPaymentConnection) одоогоор үлдээнэ — fix биш
- Migration types.ts автоматаар update хийгдэнэ

## Алхам бүрийн дараалал
1. Migration → approve хүлээх
2. Login + admin.tsx fix
3. Products form upgrade
4. Orders upgrades (manual modal + delete + delivery)
5. Settings edit + delivery fields
6. Storefront banner + category filter
7. Edge function (хэрэгцээтэй бол)
