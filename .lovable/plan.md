## Зорилго

Жолооч "Хүргэгдсэн" товч дарсны дараа төлбөр цуглуулах процессыг бүрэн автоматжуулна. Одоогийн захиалга/хүргэлт/төлбөрийн системийг ӨӨРЧЛӨХГҮЙ — зөвхөн дээр нь автомат payment collection давхарга нэмнэ.

## Архитектур

```text
Driver: "Delivered" дарна
        ↓
   Popup: "Газар дээр төлбөр авсан уу?"
        ↓                          ↓
       YES                         NO
        ↓                          ↓
 payment_status=paid     onDeliveryCompleted(orderId)
                                    ↓
                         payment_requests INSERT (pending)
                                    ↓
                         QPay invoice үүсгэх (idempotent)
                          ├─ амжилттай → invoice_url + QR
                          └─ амжилтгүй → bank transfer fallback
                                    ↓
                         CallPro SMS илгээх (idempotent)
                                    ↓
                         status = requested
                                    ↓
                         Customer төлнө → QPay webhook
                                    ↓
                         payment_requests.status = paid
                         orders.payment_status = confirmed
                         delivery_status = paid
```

## Өгөгдлийн загвар (шинэ migration)

**payment_requests хүснэгт:**
- `id, order_id (unique), merchant_id, customer_phone, amount`
- `payment_provider` (qpay | bank_transfer)
- `invoice_id, invoice_url, qr_text, qr_image`
- `bank_account` (fallback үед)
- `status` (pending | requested | paid | expired | cancelled)
- `sms_sent_at, sms_attempts, last_sms_error`
- `created_at, updated_at, paid_at, expires_at`
- UNIQUE(order_id) — давхар invoice үүсэхгүй
- RLS: merchant staff + platform admin

**platform_settings шинэ түлхүүрүүд:**
- `callpro_sms` → `{ api_url, api_key, sender }`
- `bank_account_info` → `{ bank, account_number, account_name }`
- `auto_payment_collection` → `{ enabled, sms_template, expires_hours }`

**orders.delivery_status** — шинэ утгууд: `payment_requested`, `paid` (одоо байгаа column-ийг ашиглана, schema өөрчлөхгүй).

## Server functions / routes

**`src/lib/payment-collection/collection.service.ts`** (server-only)
- `onDeliveryCompleted(orderId, { collectedInCash })` — main entry
- `createPaymentRequest(order)` — idempotent (UNIQUE constraint)
- `generateQpayForRequest(req)` — одоо байгаа `createQpayInvoice` дуудна
- `sendCollectionSms(req)` — CallPro дуудаж, attempts++
- `markPaymentRequestPaid(orderId)` — webhook-оос

**`src/lib/payment-collection/callpro.ts`** — CallPro SMS клиент

**`src/lib/payment-collection/collection.functions.ts`** (createServerFn)
- `triggerCollectionForOrder` (merchant staff) — гар аргаар дахин эхлүүлэх
- `resendCollectionSms` — Admin Resend SMS товч
- `markRequestPaidManually` — Mark Paid товч
- `listPaymentRequests` — Admin panel
- `getPaymentCollectionStats` — Pending / Paid today / Collection rate / Overdue

**delivery flow integration:**
- `src/lib/delivery/delivery.functions.ts` `updateDeliveryStatusFn` дотор status === "delivered" болсон үед `onDeliveryCompleted` дуудна (collectedInCash=false default).
- `src/routes/driver.tsx` — "Хүргэсэн" товч дарахад popup: "Газар дээр төлбөр авсан уу? Тийм / Үгүй". Тийм бол `collectedInCash=true` дамжуулна.

**QPay webhook өргөтгөл:** `src/routes/api.public.qpay.webhook.ts` — төлбөр баталгаажихад `payment_requests.status = paid`, `paid_at = now()` болгож шинэчилнэ.

## UI

**Driver (`src/routes/driver.tsx`):**
- "Хүргэсэн" товч → AlertDialog popup → Тийм / Үгүй сонголт
- Payment request үүссэн бол захиалгын карт дээр статус badge

**Admin (`src/routes/admin.orders.tsx` эсвэл шинэ `admin.payments.tsx`):**
- Шинэ "Төлбөр цуглуулалт" самбар:
  - Stat картууд: Хүлээгдэж буй / Өнөөдөр төлсөн / Цуглуулалтын хувь / Хугацаа хэтэрсэн
  - Хүсэлтүүдийн жагсаалт: захиалга №, хэрэглэгч, дүн, status, үйлдлүүд
  - Үйлдэл: SMS дахин илгээх, Холбоос хуулах, Invoice үзэх, Гараар төлсөн гэж тэмдэглэх

**Merchant settings (`src/routes/admin.settings.tsx` эсвэл merchant settings):**
- CallPro SMS credentials форм (api_url, api_key, sender)
- Банкны данс мэдээлэл
- Auto collection toggle + SMS template засах

**Customer tracking (`src/routes/store.$merchantSlug.order.$orderId.tsx`):**
- Хэрэв `payment_request` байгаа бол:
  - "Төлбөр хүлээгдэж байна" / "Төлөгдсөн" badge
  - QPay QR зураг + Pay button + invoice link
  - Bank transfer fallback бол данс + гүйлгээний утга харуулна

## Аюулгүй байдал ба идемпотент

- `payment_requests.order_id` UNIQUE — давхар invoice үүсэхгүй
- SMS илгээхдээ `sms_sent_at IS NULL OR force=true` шалгана
- QPay webhook дотор `status === 'paid'` бол дахин боловсруулахгүй
- QPay invoice үүсгэхэд алдаа гарвал автоматаар bank_transfer руу шилжиж SMS илгээнэ
- SMS амжилтгүй бол `sms_attempts++`, `last_sms_error` хадгална. Admin-аас retry хийнэ.

## Нууц утгууд

CallPro API key хэрэгтэй — `add_secret` ашиглаж дараах нэрсээр асууна:
- `CALLPRO_API_URL`
- `CALLPRO_API_KEY`
- `CALLPRO_SENDER`

(Хэрэв merchant өөрсдөө CallPro credential оруулахыг хүсвэл merchant settings дотор хадгална, аль алиныг дэмжинэ — merchant override > platform default.)

## Хэрэгжүүлэх дараалал

1. Migration: `payment_requests` хүснэгт + GRANT + RLS + UNIQUE(order_id) + history trigger
2. CallPro секрет нэмэх
3. `payment-collection/` service + functions + CallPro клиент
4. `updateDeliveryStatusFn` дотор delivered hook
5. QPay webhook өргөтгөл
6. Driver popup
7. Admin "Төлбөр цуглуулалт" самбар
8. Customer tracking page-д төлбөрийн хэсэг
9. Merchant settings-д CallPro + банкны данс талбар

## Гадуур үлдэх зүйлс

- Одоо байгаа QPay checkout flow (захиалга үүсэх үед invoice үүсгэдэг) ӨӨРЧЛӨХГҮЙ
- Одоо байгаа delivery webhook, Swift integration ӨӨРЧЛӨХГҮЙ
- Одоо байгаа order/cart/checkout логик ӨӨРЧЛӨХГҮЙ
