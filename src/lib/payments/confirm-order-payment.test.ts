import { describe, it, expect, beforeEach, vi } from "vitest";

/**
 * Tests confirmOrderPayment idempotency by stubbing the supabaseAdmin client
 * with an in-memory "orders" + "payment_requests" store.
 */

type Order = {
  id: string;
  merchant_id: string;
  payment_status: string;
  paid_at: string | null;
  delivery_status: string | null;
  payment_error?: string | null;
  updated_at?: string;
};

const state = {
  orders: new Map<string, Order>(),
  paymentRequests: new Map<string, { order_id: string; status: string; paid_at: string | null }>(),
  deliveryCalls: [] as string[],
};

function makeOrder(id: string, status = "unpaid"): Order {
  return {
    id,
    merchant_id: "m1",
    payment_status: status,
    paid_at: null,
    delivery_status: null,
  };
}

// ---- Mocks -----------------------------------------------------------------

vi.mock("@/integrations/supabase/client.server", () => {
  function fromOrders() {
    return {
      select: () => ({
        eq: (_col: string, id: string) => ({
          maybeSingle: async () => {
            const o = state.orders.get(id);
            return { data: o ? { ...o } : null, error: null };
          },
        }),
      }),
      update: (patch: Partial<Order>) => {
        let lastId: string | null = null;
        let neqCol: string | null = null;
        let neqVal: any = null;
        const builder: any = {
          eq: (_c: string, id: string) => {
            lastId = id;
            return builder;
          },
          neq: (col: string, val: any) => {
            neqCol = col;
            neqVal = val;
            return builder;
          },
          select: () => ({
            // resolves to array (post .select())
            then: (cb: any) => {
              const o = state.orders.get(lastId!);
              if (!o) return cb({ data: [], error: null });
              if (neqCol && (o as any)[neqCol] === neqVal) {
                return cb({ data: [], error: null });
              }
              Object.assign(o, patch);
              return cb({ data: [{ id: o.id }], error: null });
            },
          }),
          then: (cb: any) => {
            // bare update with no .select()
            const o = state.orders.get(lastId!);
            if (o) {
              if (!neqCol || (o as any)[neqCol] !== neqVal) Object.assign(o, patch);
            }
            return cb({ data: null, error: null });
          },
        };
        return builder;
      },
    };
  }

  function fromPaymentRequests() {
    return {
      update: (patch: any) => {
        let orderId: string | null = null;
        let neqCol: string | null = null;
        let neqVal: any = null;
        const builder: any = {
          eq: (col: string, val: string) => {
            if (col === "order_id") orderId = val;
            return builder;
          },
          neq: (col: string, val: any) => {
            neqCol = col;
            neqVal = val;
            return builder;
          },
          then: (cb: any) => {
            for (const pr of state.paymentRequests.values()) {
              if (pr.order_id !== orderId) continue;
              if (neqCol && (pr as any)[neqCol] === neqVal) continue;
              Object.assign(pr, patch);
            }
            return cb({ data: null, error: null });
          },
        };
        return builder;
      },
    };
  }

  return {
    supabaseAdmin: {
      from: (table: string) => {
        if (table === "orders") return fromOrders();
        if (table === "payment_requests") return fromPaymentRequests();
        if (table === "notifications_log") {
          return { insert: async () => ({ error: null }) };
        }
        throw new Error(`Unexpected table: ${table}`);
      },
    },
  };
});

vi.mock("@/lib/delivery/delivery.service", () => ({
  createDeliveryRequest: async ({ orderId }: { orderId: string }) => {
    state.deliveryCalls.push(orderId);
    return { ok: true, alreadyExists: false };
  },
}));

// ---- Tests -----------------------------------------------------------------

import { confirmOrderPayment } from "./confirm-order-payment.server";

describe("confirmOrderPayment", () => {
  beforeEach(() => {
    state.orders.clear();
    state.paymentRequests.clear();
    state.deliveryCalls.length = 0;
  });

  it("confirms an unpaid order and creates a delivery request", async () => {
    state.orders.set("o1", makeOrder("o1", "unpaid"));
    state.paymentRequests.set("pr1", { order_id: "o1", status: "pending", paid_at: null });

    const res = await confirmOrderPayment({ orderId: "o1", source: "qpay_webhook" });

    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.alreadyPaid).toBe(false);
      expect(res.deliveryRequestCreated).toBe(true);
    }
    expect(state.orders.get("o1")?.payment_status).toBe("confirmed");
    expect(state.orders.get("o1")?.paid_at).not.toBeNull();
    expect(state.paymentRequests.get("pr1")?.status).toBe("paid");
    expect(state.deliveryCalls).toEqual(["o1"]);
  });

  it("is idempotent — second call does NOT re-trigger delivery", async () => {
    state.orders.set("o2", makeOrder("o2", "unpaid"));

    const first = await confirmOrderPayment({ orderId: "o2", source: "qpay_webhook" });
    const second = await confirmOrderPayment({ orderId: "o2", source: "qpay_polling" });
    const third = await confirmOrderPayment({ orderId: "o2", source: "admin_manual" });

    expect(first.ok && !first.alreadyPaid).toBe(true);
    expect(second.ok && (second as any).alreadyPaid).toBe(true);
    expect(third.ok && (third as any).alreadyPaid).toBe(true);
    // Delivery should only have been created once.
    expect(state.deliveryCalls).toEqual(["o2"]);
  });

  it("returns ok=false for an unknown order", async () => {
    const res = await confirmOrderPayment({ orderId: "missing", source: "admin_manual" });
    expect(res.ok).toBe(false);
  });

  it("respects skipDelivery option", async () => {
    state.orders.set("o3", makeOrder("o3", "unpaid"));
    const res = await confirmOrderPayment({
      orderId: "o3",
      source: "bulk_import",
      skipDelivery: true,
    });
    expect(res.ok).toBe(true);
    expect(state.deliveryCalls).toEqual([]);
  });
});
