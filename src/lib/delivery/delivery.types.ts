export type DeliveryStatus =
  | "pending"
  | "requested"
  | "assigned"
  | "picked_up"
  | "in_transit"
  | "delivered"
  | "failed"
  | "cancelled";

export type DeliveryMode = "local" | "external";

export const DELIVERY_STATUS_LABELS: Record<DeliveryStatus, string> = {
  pending: "Хүлээгдэж буй",
  requested: "Хүсэлт илгээсэн",
  assigned: "Жолоочид оноосон",
  picked_up: "Барааг авсан",
  in_transit: "Замдаа",
  delivered: "Хүргэгдсэн",
  failed: "Амжилтгүй",
  cancelled: "Цуцалсан",
};

export const DELIVERY_STATUS_TONE: Record<DeliveryStatus, string> = {
  pending: "bg-muted text-muted-foreground border-border",
  requested: "bg-blue-500/15 text-blue-600 border-blue-500/30",
  assigned: "bg-indigo-500/15 text-indigo-600 border-indigo-500/30",
  picked_up: "bg-amber-500/15 text-amber-600 border-amber-500/30",
  in_transit: "bg-amber-500/15 text-amber-600 border-amber-500/30",
  delivered: "bg-emerald-500/15 text-emerald-600 border-emerald-500/30",
  failed: "bg-destructive/15 text-destructive border-destructive/30",
  cancelled: "bg-destructive/10 text-destructive border-destructive/30",
};

export const TERMINAL_STATUSES: DeliveryStatus[] = ["delivered", "failed", "cancelled"];

export function isTerminalDeliveryStatus(s: string | null | undefined): boolean {
  return !!s && TERMINAL_STATUSES.includes(s as DeliveryStatus);
}
