import { describe, it, expect, beforeEach, vi } from "vitest";

/**
 * Tests withWebhookIdempotency by stubbing supabaseAdmin with an in-memory
 * webhook_events table that enforces UNIQUE (provider, event_key).
 */

const state = {
  events: new Map<string, { id: string; provider: string; event_key: string; result: any }>(),
  handlerCalls: 0,
};

function key(p: string, k: string) {
  return `${p}::${k}`;
}

vi.mock("@/integrations/supabase/client.server", () => {
  function fromWebhookEvents() {
    return {
      insert: (row: any) => ({
        select: () => ({
          single: async () => {
            const k = key(row.provider, row.event_key);
            if (state.events.has(k)) {
              return { data: null, error: { message: "duplicate key" } };
            }
            const id = crypto.randomUUID();
            state.events.set(k, { id, provider: row.provider, event_key: row.event_key, result: row.result ?? null });
            return { data: { id }, error: null };
          },
        }),
      }),
      select: (_cols: string) => {
        let provider: string | null = null;
        let eventKey: string | null = null;
        const builder: any = {
          eq: (col: string, val: string) => {
            if (col === "provider") provider = val;
            if (col === "event_key") eventKey = val;
            return builder;
          },
          maybeSingle: async () => {
            const rec = state.events.get(key(provider!, eventKey!));
            return { data: rec ? { result: rec.result } : null, error: null };
          },
        };
        return builder;
      },
      update: (patch: any) => {
        let id: string | null = null;
        const builder: any = {
          eq: (_col: string, val: string) => {
            id = val;
            return builder;
          },
          then: (cb: any) => {
            for (const rec of state.events.values()) {
              if (rec.id === id) Object.assign(rec, patch);
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
        if (table === "webhook_events") return fromWebhookEvents();
        throw new Error(`Unexpected table ${table}`);
      },
    },
  };
});

import { withWebhookIdempotency, hashPayload } from "./idempotency.server";

describe("withWebhookIdempotency", () => {
  beforeEach(() => {
    state.events.clear();
    state.handlerCalls = 0;
  });

  it("runs handler on first call and persists result", async () => {
    const res = await withWebhookIdempotency({
      provider: "p1",
      eventKey: "e1",
      handler: async () => {
        state.handlerCalls++;
        return { ok: true, value: 42 };
      },
    });
    expect(res.duplicate).toBe(false);
    expect(res.result).toEqual({ ok: true, value: 42 });
    expect(state.handlerCalls).toBe(1);
  });

  it("skips handler on duplicate event_key", async () => {
    const handler = async () => {
      state.handlerCalls++;
      return { n: state.handlerCalls };
    };
    await withWebhookIdempotency({ provider: "p1", eventKey: "dupe", handler });
    const second = await withWebhookIdempotency({ provider: "p1", eventKey: "dupe", handler });
    const third = await withWebhookIdempotency({ provider: "p1", eventKey: "dupe", handler });

    expect(state.handlerCalls).toBe(1);
    expect(second.duplicate).toBe(true);
    expect(third.duplicate).toBe(true);
    expect(second.storedResult).toEqual({ n: 1 });
  });

  it("different providers do not collide on same event_key", async () => {
    await withWebhookIdempotency({
      provider: "qpay",
      eventKey: "x",
      handler: async () => ({ p: "qpay" }),
    });
    const swift = await withWebhookIdempotency({
      provider: "swift",
      eventKey: "x",
      handler: async () => ({ p: "swift" }),
    });
    expect(swift.duplicate).toBe(false);
    expect(swift.result).toEqual({ p: "swift" });
  });

  it("hashPayload returns stable SHA-256 hex", async () => {
    const a = await hashPayload("hello");
    const b = await hashPayload("hello");
    const c = await hashPayload("world");
    expect(a).toBe(b);
    expect(a).not.toBe(c);
    expect(a).toMatch(/^[0-9a-f]{64}$/);
  });
});
