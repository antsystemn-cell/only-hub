// Pure shipping & bundle pricing engine. No I/O.
// Used both client-side (live cart preview) and server-side (order finalization).

export type ShippingRule = {
  base_fee: number;
  free_threshold: number | null;
  express_fee: number;
  express_available: boolean;
  weekend_free: boolean;
  is_active: boolean;
};

export type BundleCampaign = {
  id: string;
  merchant_id: string | null; // null = platform
  name: string;
  type: "free_shipping_qty" | "free_shipping_amount" | "percent_discount" | "weekend_free";
  min_qty: number;
  min_amount: number;
  discount_percent: number;
  product_ids: string[];
  category?: string | null;
  starts_at?: string | null;
  ends_at?: string | null;
  is_active: boolean;
};

export type CartLine = {
  productId: string;
  category?: string | null;
  price: number;
  quantity: number;
};

export type ShippingInput = {
  merchantId: string;
  lines: CartLine[];
  rule?: ShippingRule | null;
  campaigns?: BundleCampaign[];
  selectedDeliveryFee?: number | null; // manual delivery_option override
  isExpress?: boolean;
  now?: Date;
  platformDefaults?: { base_fee?: number; free_threshold?: number | null };
};

export type ShippingResult = {
  subtotal: number;
  totalQty: number;
  deliveryFee: number;
  baseFee: number;
  freeThreshold: number | null;
  amountToFreeShipping: number; // 0 if reached or no threshold
  freeShippingReached: boolean;
  discount: number; // platform/bundle product discount (excludes coupon)
  appliedCampaigns: { id: string; name: string; reason: string }[];
};

function isWithinWindow(c: BundleCampaign, now: Date) {
  if (c.starts_at && new Date(c.starts_at) > now) return false;
  if (c.ends_at && new Date(c.ends_at) < now) return false;
  return true;
}

function isWeekend(d: Date) {
  const day = d.getDay();
  return day === 0 || day === 6;
}

function targetsLine(c: BundleCampaign, line: CartLine) {
  if (c.product_ids?.length) return c.product_ids.includes(line.productId);
  if (c.category && line.category) return c.category === line.category;
  return true; // applies to whole cart when neither set
}

export function calculateShipping(input: ShippingInput): ShippingResult {
  const now = input.now ?? new Date();
  const lines = input.lines;
  const subtotal = lines.reduce((s, l) => s + l.price * l.quantity, 0);
  const totalQty = lines.reduce((s, l) => s + l.quantity, 0);

  const rule = input.rule ?? null;
  const baseFee = input.selectedDeliveryFee != null
    ? input.selectedDeliveryFee
    : input.isExpress && rule?.express_available
    ? Number(rule.express_fee ?? 0)
    : Number(rule?.base_fee ?? input.platformDefaults?.base_fee ?? 0);

  const freeThreshold =
    rule?.free_threshold != null
      ? Number(rule.free_threshold)
      : input.platformDefaults?.free_threshold ?? null;

  let deliveryFee = baseFee;
  let discount = 0;
  const applied: ShippingResult["appliedCampaigns"] = [];

  // Merchant-level free threshold
  let freeShippingReached = false;
  if (freeThreshold != null && subtotal >= freeThreshold) {
    deliveryFee = 0;
    freeShippingReached = true;
  }

  // Weekend free shipping flag on rule
  if (rule?.weekend_free && isWeekend(now)) {
    deliveryFee = 0;
    freeShippingReached = true;
    applied.push({ id: "rule-weekend", name: "Амралтын өдрийн үнэгүй хүргэлт", reason: "weekend" });
  }

  // Campaigns
  const active = (input.campaigns ?? []).filter(
    (c) => c.is_active && isWithinWindow(c, now) && (c.merchant_id === input.merchantId || c.merchant_id == null),
  );
  for (const c of active) {
    const relevant = lines.filter((l) => targetsLine(c, l));
    const relevantQty = relevant.reduce((s, l) => s + l.quantity, 0);
    const relevantAmt = relevant.reduce((s, l) => s + l.price * l.quantity, 0);

    switch (c.type) {
      case "free_shipping_qty":
        if (relevantQty >= (c.min_qty ?? 0)) {
          deliveryFee = 0;
          freeShippingReached = true;
          applied.push({ id: c.id, name: c.name, reason: `${c.min_qty}+ ширхэг` });
        }
        break;
      case "free_shipping_amount":
        if (relevantAmt >= (c.min_amount ?? 0)) {
          deliveryFee = 0;
          freeShippingReached = true;
          applied.push({ id: c.id, name: c.name, reason: `${c.min_amount}₮+` });
        }
        break;
      case "weekend_free":
        if (isWeekend(now)) {
          deliveryFee = 0;
          freeShippingReached = true;
          applied.push({ id: c.id, name: c.name, reason: "weekend" });
        }
        break;
      case "percent_discount":
        if (relevantAmt >= (c.min_amount ?? 0)) {
          const d = Math.round((relevantAmt * Number(c.discount_percent ?? 0)) / 100);
          discount += d;
          applied.push({ id: c.id, name: c.name, reason: `${c.discount_percent}% хямдрал` });
        }
        break;
    }
  }

  const amountToFree =
    freeThreshold != null && !freeShippingReached
      ? Math.max(0, freeThreshold - subtotal)
      : 0;

  return {
    subtotal,
    totalQty,
    deliveryFee: Math.max(0, deliveryFee),
    baseFee,
    freeThreshold,
    amountToFreeShipping: amountToFree,
    freeShippingReached,
    discount,
    appliedCampaigns: applied,
  };
}
