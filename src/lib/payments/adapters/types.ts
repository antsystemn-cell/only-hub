// Common payment provider adapter interface. Every provider implementation
// (Storepay, Pocket, Omniway, QPay, …) exports the same shape so server
// functions can dispatch by provider_type without special-casing.

export type ProviderType = "qpay" | "storepay" | "pocket" | "omniway";

export type AdapterInvoice = {
  invoiceId: string;
  qrText?: string | null;
  qrImage?: string | null;
  deeplink?: string | null;
  urls?: unknown;
  raw?: unknown;
  /** Provider-side identifier used to poll status later (e.g. Storepay requestId). */
  requestId?: string | null;
};

export type CreateInvoiceInput = {
  orderId: string;
  amount: number;
  description: string;
  phone?: string | null;
  /** Reference number visible on customer's bank/app statements. */
  orderRef?: string | null;
  /** Absolute webhook URL the provider should call back. */
  callbackUrl: string;
  credentials: Record<string, any>;
};

export type CheckStatusInput = {
  invoiceId?: string | null;
  requestId?: string | null;
  orderRef?: string | null;
  credentials: Record<string, any>;
};

export type CheckStatusResult = {
  status: "waiting" | "paid" | "failed" | "cancelled";
  raw?: unknown;
};

export type TestConnectionResult = {
  ok: boolean;
  message: string;
};

export interface PaymentProviderAdapter {
  /** Validate that the saved credentials work against the provider's auth endpoint. */
  testConnection(credentials: Record<string, any>): Promise<TestConnectionResult>;
  createInvoice(input: CreateInvoiceInput): Promise<AdapterInvoice>;
  checkStatus(input: CheckStatusInput): Promise<CheckStatusResult>;
  /** Which credential keys the merchant must populate before this provider is "verified". */
  requiredFields: string[];
}
