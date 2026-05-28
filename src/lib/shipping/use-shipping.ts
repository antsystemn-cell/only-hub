import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  calculateShipping,
  type BundleCampaign,
  type CartLine,
  type ShippingRule,
  type ShippingResult,
} from "./shipping.engine";

export type UseShippingArgs = {
  merchantId?: string | null;
  lines: CartLine[];
  selectedDeliveryFee?: number | null;
  isExpress?: boolean;
};

export function useShipping(args: UseShippingArgs): ShippingResult {
  const { merchantId, lines, selectedDeliveryFee, isExpress } = args;

  const { data: rule } = useQuery({
    queryKey: ["shipping-rule", merchantId],
    enabled: !!merchantId,
    staleTime: 60_000,
    queryFn: async () => {
      const { data } = await supabase
        .from("shipping_rules" as any)
        .select("*")
        .eq("merchant_id", merchantId!)
        .eq("is_active", true)
        .maybeSingle();
      return (data as ShippingRule | null) ?? null;
    },
  });

  const { data: campaigns = [] } = useQuery({
    queryKey: ["bundle-campaigns", merchantId],
    enabled: !!merchantId,
    staleTime: 60_000,
    queryFn: async () => {
      const { data } = await supabase
        .from("bundle_campaigns" as any)
        .select("*")
        .or(`merchant_id.eq.${merchantId},merchant_id.is.null`)
        .eq("is_active", true);
      return ((data as any[]) ?? []).map((c) => ({
        ...c,
        product_ids: Array.isArray(c.product_ids) ? c.product_ids : [],
      })) as BundleCampaign[];
    },
  });

  const { data: platformDefaults } = useQuery({
    queryKey: ["platform-defaults-shipping"],
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data } = await supabase
        .from("platform_settings" as any)
        .select("key,value")
        .in("key", ["default_delivery_fee", "default_free_threshold"]);
      const map = new Map((data ?? []).map((r: any) => [r.key, r.value]));
      const fee = map.get("default_delivery_fee") as any;
      const thr = map.get("default_free_threshold") as any;
      return {
        base_fee: typeof fee === "number" ? fee : Number(fee?.value ?? fee ?? 0),
        free_threshold:
          thr == null ? null : typeof thr === "number" ? thr : Number(thr?.value ?? thr ?? 0) || null,
      };
    },
  });

  return useMemo(
    () =>
      calculateShipping({
        merchantId: merchantId ?? "",
        lines,
        rule: rule ?? null,
        campaigns,
        selectedDeliveryFee: selectedDeliveryFee ?? null,
        isExpress,
        platformDefaults: platformDefaults ?? undefined,
      }),
    [merchantId, lines, rule, campaigns, selectedDeliveryFee, isExpress, platformDefaults],
  );
}
