// Map internal payment/delivery/order statuses → single simple label used
// across merchant / admin / customer UIs.
//
// Allowed display labels:
//   - "Төлбөр хүлээгдэж байна"
//   - "Баталгаажсан"
//   - "Хүргэлтэнд"
//   - "Дууссан"
//   - "Цуцлагдсан"

export type SimpleOrderStatus =
  | "awaiting_payment"
  | "confirmed"
  | "delivering"
  | "completed"
  | "cancelled";

export interface OrderStatusInput {
  status?: string | null;
  payment_status?: string | null;
  delivery_status?: string | null;
}

export function simpleOrderStatus(o: OrderStatusInput): SimpleOrderStatus {
  const s = String(o.status ?? "").toLowerCase();
  const ps = String(o.payment_status ?? "").toLowerCase();
  const ds = String(o.delivery_status ?? "").toLowerCase();

  if (s === "cancelled" || ps === "cancelled" || ps === "expired" || ds === "cancelled") {
    return "cancelled";
  }
  if (s === "completed" || ds === "delivered") return "completed";
  if (ds === "picked_up" || ds === "in_transit" || ds === "assigned" || s === "delivering") {
    return "delivering";
  }
  if (ps === "confirmed") return "confirmed";
  return "awaiting_payment";
}

export const SIMPLE_ORDER_LABEL: Record<SimpleOrderStatus, string> = {
  awaiting_payment: "Төлбөр хүлээгдэж байна",
  confirmed: "Баталгаажсан",
  delivering: "Хүргэлтэнд",
  completed: "Дууссан",
  cancelled: "Цуцлагдсан",
};

export const SIMPLE_ORDER_TONE: Record<SimpleOrderStatus, "warning" | "info" | "default" | "success" | "destructive"> = {
  awaiting_payment: "warning",
  confirmed: "info",
  delivering: "info",
  completed: "success",
  cancelled: "destructive",
};

export function simpleOrderLabel(o: OrderStatusInput): string {
  return SIMPLE_ORDER_LABEL[simpleOrderStatus(o)];
}
