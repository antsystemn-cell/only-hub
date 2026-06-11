import { describe, it, expect, vi } from "vitest";

const inserts: any[] = [];

vi.mock("@/integrations/supabase/client.server", () => ({
  supabaseAdmin: {
    from: () => ({
      insert: (row: any) => {
        inserts.push(row);
        return Promise.resolve({ error: null });
      },
    }),
  },
}));

import { logNotification } from "./log.server";

describe("logNotification", () => {
  it("inserts a sent SMS row with defaults", async () => {
    inserts.length = 0;
    await logNotification({
      orderId: "11111111-1111-1111-1111-111111111111",
      merchantId: "22222222-2222-2222-2222-222222222222",
      eventType: "payment_requested",
      recipient: "99119911",
      message: "hi",
    });
    expect(inserts).toHaveLength(1);
    expect(inserts[0].event_type).toBe("payment_requested");
    expect(inserts[0].channel).toBe("sms");
    expect(inserts[0].status).toBe("sent");
    expect(inserts[0].attempt).toBe(1);
  });

  it("never throws even if insert rejects", async () => {
    inserts.length = 0;
    vi.doMock("@/integrations/supabase/client.server", () => ({
      supabaseAdmin: {
        from: () => ({ insert: () => Promise.reject(new Error("db down")) }),
      },
    }));
    await expect(
      logNotification({ eventType: "paid", channel: "system" }),
    ).resolves.toBeUndefined();
  });
});
