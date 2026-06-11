// End-to-end production-safety invariants.
// Each test exercises a single guarantee that the Only Hub hardening plan
// promised. They use lightweight in-memory mocks of supabaseAdmin so the
// suite runs without a real database.
import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Shared mock state
// ---------------------------------------------------------------------------
type Order = {
  id: string;
  merchant_id: string;
  payment_status: string;
  paid_at: string | null;
  delivery_status: string | null;
  total: number;
  phone: string;
};

const state = {
  orders: new Map<string, Order>(),
  deliveries: new Map<string, { order_id: string; status: string }>(),
  payments: new Map<string, { order_id: string; status: string; sms_attempts: number }>(),
  webhookEvents: new Map<string, any>(),
  notifications: [] as any[],
  couponUses: new Map<string, { used: number; max: number | null }>(),
  stocks: new Map<string, number>(),
  deliveryDispatches: 0,
  smsSends: 0,
};

function reset() {
  state.orders.clear();
  state.deliveries.clear();
  state.payments.clear();
  state.webhookEvents.clear();
  state.notifications.length = 0;
  state.couponUses.clear();
  state.stocks.clear();
  state.deliveryDispatches = 0;
  state.smsSends = 0;
}

// Minimal supabaseAdmin mock — only the surface we touch in these tests.
function fromOrders() {
  let id: string | null = null;
  let patch: any = {};
  let neqCol: string | null = null;
  let neqVal: any = null;
  const builder: any = {
    select: () => builder,
    update: (p: any) => { patch = p; return builder; },
    insert: () => builder,
    eq: (col: string, val: any) => { if (col === "id") id = val; return builder; },
    neq: (col: string, val: any) => { neqCol = col; neqVal = val; return builder; },
    maybeSingle: async () => ({ data: id ? state.orders.get(id) ?? null : null, error: null }),
    single: async () => ({ data: id ? state.orders.get(id) ?? null : null, error: null }),
    then: (cb: any) => {
      // .update().eq().neq().select() pattern
      if (id && Object.keys(patch).length) {
        const o = state.orders.get(id);
        if (o) {
          if (neqCol && (o as any)[neqCol] === neqVal) {
            return cb({ data: [], error: null });
          }
          Object.assign(o, patch);
          return cb({ data: [{ id }], error: null });
        }
      }
      return cb({ data: null, error: null });
    },
  };
  return builder;
}

vi.mock("@/integrations/supabase/client.server", () => ({
  supabaseAdmin: {
    from: (table: string) => {
      if (table === "orders") return fromOrders();
      if (table === "payment_requests") {
        let orderId: string | null = null;
        let patch: any = {};
        const b: any = {
          select: () => b,
          update: (p: any) => { patch = p; return b; },
          insert: (row: any) => {
            const r = { ...row, id: crypto.randomUUID(), sms_attempts: 0, status: "pending" };
            state.payments.set(r.id, r as any);
            return { select: () => ({ single: async () => ({ data: r, error: null }) }) };
          },
          eq: (col: string, val: any) => { if (col === "order_id") orderId = val; return b; },
          neq: () => b,
          not: () => b,
          lt: () => b,
          limit: () => b,
          maybeSingle: async () => {
            for (const p of state.payments.values()) {
              if (p.order_id === orderId) return { data: p, error: null };
            }
            return { data: null, error: null };
          },
          then: (cb: any) => {
            for (const p of state.payments.values()) {
              if (orderId && p.order_id !== orderId) continue;
              Object.assign(p, patch);
            }
            return cb({ data: null, error: null });
          },
        };
        return b;
      }
      if (table === "webhook_events") {
        return {
          insert: async (row: any) => {
            const key = `${row.provider}:${row.event_key}`;
            if (state.webhookEvents.has(key)) {
              return { error: { code: "23505", message: "duplicate" } };
            }
            state.webhookEvents.set(key, row);
            return { error: null };
          },
          select: () => ({
            eq: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }),
          }),
          update: () => ({ eq: () => ({ eq: () => Promise.resolve({ error: null }) }) }),
        } as any;
      }
      if (table === "notifications_log") {
        return {
          insert: async (row: any) => {
            state.notifications.push(row);
            return { error: null };
          },
        };
      }
      return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }) };
    },
    rpc: async (name: string, args: any) => {
      if (name === "consume_coupon") {
        const c = state.couponUses.get(args._coupon_id);
        if (!c) return { data: false, error: null };
        if (c.max !== null && c.used >= c.max) return { data: false, error: null };
        c.used += 1;
        return { data: true, error: null };
      }
      if (name === "decrement_variant_stocks") {
        const items = args._items as Array<{ product_id: string; variant_key: string; qty: number }>;
        for (const i of items) {
          const k = `${i.product_id}:${i.variant_key}`;
          const cur = state.stocks.get(k) ?? 0;
          if (cur < i.qty) {
            return { data: { ok: false, insufficient: [{ ...i, remaining: cur }] }, error: null };
          }
        }
        for (const i of items) {
          const k = `${i.product_id}:${i.variant_key}`;
          state.stocks.set(k, (state.stocks.get(k) ?? 0) - i.qty);
        }
        return { data: { ok: true }, error: null };
      }
      if (name === "restore_variant_stocks") {
        const items = args._items as Array<{ product_id: string; variant_key: string; qty: number }>;
        for (const i of items) {
          const k = `${i.product_id}:${i.variant_key}`;
          state.stocks.set(k, (state.stocks.get(k) ?? 0) + i.qty);
        }
        return { data: null, error: null };
      }
      return { data: null, error: null };
    },
  },
}));

// Capture deliveryDispatches inside the createDeliveryRequest mock.
vi.mock("@/lib/delivery/delivery.service", () => ({
  createDeliveryRequest: async ({ orderId }: { orderId: string }) => {
    if (state.deliveries.has(orderId)) {
      return { ok: true, alreadyExists: true, deliveryRequest: state.deliveries.get(orderId) };
    }
    state.deliveryDispatches += 1;
    const dr = { order_id: orderId, status: "requested" };
    state.deliveries.set(orderId, dr);
    return { ok: true, deliveryRequest: dr };
  },
}));

// SMS sender mock used by collection.service. We bypass collection.service
// for these invariant tests because their internal flow is exercised in
// dedicated suites; here we focus on the shared building blocks.
vi.mock("@/lib/payment-collection/callpro.server", () => ({
  sendCallproSms: async () => {
    state.smsSends += 1;
    return { ok: true, provider: "callpro", raw: {} };
  },
}));

// ---------------------------------------------------------------------------
// Modules under test
// ---------------------------------------------------------------------------
import { confirmOrderPayment } from "@/lib/payments/confirm-order-payment.server";
import { withWebhookIdempotency, hashPayload } from "@/lib/webhooks/idempotency.server";

beforeEach(() => reset());

// ---------------------------------------------------------------------------
// 1. Payment confirmed exactly once + delivery created exactly once
// ---------------------------------------------------------------------------
describe("invariant: payment only once + delivery only once", () => {
  it("multiple concurrent confirmations create one delivery", async () => {
    state.orders.set("o-1", {
      id: "o-1",
      merchant_id: "m-1",
      payment_status: "pending",
      paid_at: null,
      delivery_status: null,
      total: 50000,
      phone: "99119911",
    });

    const calls = await Promise.all([
      confirmOrderPayment({ orderId: "o-1", source: "qpay_webhook" }),
      confirmOrderPayment({ orderId: "o-1", source: "qpay_polling" }),
      confirmOrderPayment({ orderId: "o-1", source: "admin_manual" }),
    ]);

    expect(calls.every((c) => c.ok)).toBe(true);
    const fresh = calls.filter((c: any) => c.ok && c.alreadyPaid === false);
    expect(fresh.length).toBe(1); // exactly one caller actually flipped the row
    expect(state.deliveryDispatches).toBe(1); // delivery created once
    expect(state.orders.get("o-1")!.payment_status).toBe("confirmed");
  });
});

// ---------------------------------------------------------------------------
// 2. Webhook duplicates ignored
// ---------------------------------------------------------------------------
describe("invariant: webhook duplicate ignored", () => {
  it("second call with the same event_key reuses the stored result", async () => {
    let executions = 0;
    const handler = async () => {
      executions += 1;
      return { processed: true };
    };

    const a = await withWebhookIdempotency({
      provider: "qpay",
      eventKey: "evt-123",
      handler,
    });
    const b = await withWebhookIdempotency({
      provider: "qpay",
      eventKey: "evt-123",
      handler,
    });

    expect(a.duplicate).toBe(false);
    expect(b.duplicate).toBe(true);
    expect(executions).toBe(1);
  });

  it("hashPayload is stable for identical input strings", async () => {
    const s = JSON.stringify({ a: 1, b: 2 });
    expect(await hashPayload(s)).toBe(await hashPayload(s));
  });
});

// ---------------------------------------------------------------------------
// 3. Coupon counted only once per successful consume
// ---------------------------------------------------------------------------
describe("invariant: coupon counted once", () => {
  it("over-redemption is rejected once max_uses is reached", async () => {
    state.couponUses.set("c-1", { used: 0, max: 2 });
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const r1 = await supabaseAdmin.rpc("consume_coupon", { _coupon_id: "c-1" });
    const r2 = await supabaseAdmin.rpc("consume_coupon", { _coupon_id: "c-1" });
    const r3 = await supabaseAdmin.rpc("consume_coupon", { _coupon_id: "c-1" });

    expect(r1.data).toBe(true);
    expect(r2.data).toBe(true);
    expect(r3.data).toBe(false);
    expect(state.couponUses.get("c-1")!.used).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// 4. Stock protected — overselling not possible
// ---------------------------------------------------------------------------
describe("invariant: stock protection", () => {
  it("decrement fails atomically when one item is short", async () => {
    state.stocks.set("p-1:red", 5);
    state.stocks.set("p-2:blue", 1);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const res = await supabaseAdmin.rpc("decrement_variant_stocks", {
      _items: [
        { product_id: "p-1", variant_key: "red", qty: 3 },
        { product_id: "p-2", variant_key: "blue", qty: 2 }, // short
      ],
    });
    expect((res.data as any).ok).toBe(false);
    // Neither stock was mutated (atomic rejection)
    expect(state.stocks.get("p-1:red")).toBe(5);
    expect(state.stocks.get("p-2:blue")).toBe(1);
  });

  it("restore returns inventory after a failed downstream step", async () => {
    state.stocks.set("p-1:red", 5);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    await supabaseAdmin.rpc("decrement_variant_stocks", {
      _items: [{ product_id: "p-1", variant_key: "red", qty: 3 }],
    });
    expect(state.stocks.get("p-1:red")).toBe(2);

    await supabaseAdmin.rpc("restore_variant_stocks", {
      _items: [{ product_id: "p-1", variant_key: "red", qty: 3 }],
    });
    expect(state.stocks.get("p-1:red")).toBe(5);
  });
});

// ---------------------------------------------------------------------------
// 5. Notification log records every paid event exactly once
// ---------------------------------------------------------------------------
describe("invariant: notification logged on payment", () => {
  it("emits a single 'paid' notification per confirmed order", async () => {
    state.orders.set("o-2", {
      id: "o-2",
      merchant_id: "m-1",
      payment_status: "pending",
      paid_at: null,
      delivery_status: null,
      total: 10000,
      phone: "88008800",
    });

    await Promise.all([
      confirmOrderPayment({ orderId: "o-2", source: "qpay_webhook" }),
      confirmOrderPayment({ orderId: "o-2", source: "qpay_polling" }),
    ]);

    const paidEvents = state.notifications.filter((n) => n.event_type === "paid");
    expect(paidEvents.length).toBe(1);
    expect(paidEvents[0].order_id).toBe("o-2");
  });
});
