import type { PaymentProviderAdapter, ProviderType } from "./types";
import { storepayAdapter } from "./storepay.server";
import { pocketAdapter } from "./pocket.server";
import { omniwayAdapter } from "./omniway.server";
import { qpayAdapter } from "./qpay.server";
import { hipayAdapter } from "./hipay.server";

export const ADAPTERS: Record<ProviderType, PaymentProviderAdapter> = {
  qpay: qpayAdapter,
  storepay: storepayAdapter,
  pocket: pocketAdapter,
  omniway: omniwayAdapter,
  hipay: hipayAdapter,
};

export function getAdapter(type: string): PaymentProviderAdapter | null {
  return (ADAPTERS as Record<string, PaymentProviderAdapter>)[type] ?? null;
}

export { storepayAdapter, pocketAdapter, omniwayAdapter, qpayAdapter, hipayAdapter };
export type { PaymentProviderAdapter, ProviderType };
