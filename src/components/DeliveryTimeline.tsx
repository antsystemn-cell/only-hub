import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { CheckCircle2, Clock, Truck, Package, XCircle, AlertCircle } from "lucide-react";
import {
  DELIVERY_STATUS_LABELS,
  DELIVERY_STATUS_TONE,
  type DeliveryStatus,
} from "@/lib/delivery/delivery.types";

const ICONS: Record<DeliveryStatus, typeof Clock> = {
  pending: Clock,
  requested: Package,
  assigned: Package,
  picked_up: Truck,
  in_transit: Truck,
  delivered: CheckCircle2,
  failed: XCircle,
  cancelled: AlertCircle,
};

export interface DeliveryTimelineItem {
  id: string;
  status: string;
  note: string | null;
  created_at: string;
}

export function DeliveryStatusBadge({ status }: { status: string | null | undefined }) {
  const s = (status ?? "pending") as DeliveryStatus;
  const label = DELIVERY_STATUS_LABELS[s] ?? status ?? "—";
  const tone = DELIVERY_STATUS_TONE[s] ?? "bg-muted";
  return (
    <Badge variant="outline" className={cn(tone)}>
      {label}
    </Badge>
  );
}

export function DeliveryTimeline({ items }: { items: DeliveryTimelineItem[] }) {
  if (!items.length) {
    return (
      <p className="text-sm text-muted-foreground">Хүргэлтийн түүх хараахан үүсээгүй байна.</p>
    );
  }
  return (
    <ol className="relative space-y-4 border-l border-border pl-4">
      {items.map((it, idx) => {
        const s = it.status as DeliveryStatus;
        const Icon = ICONS[s] ?? Clock;
        const isLast = idx === items.length - 1;
        return (
          <li key={it.id} className="relative">
            <span
              className={cn(
                "absolute -left-[1.45rem] flex h-6 w-6 items-center justify-center rounded-full border",
                isLast
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-card text-muted-foreground",
              )}
            >
              <Icon className="h-3.5 w-3.5" />
            </span>
            <div className="flex items-center gap-2">
              <DeliveryStatusBadge status={it.status} />
              <span className="text-xs text-muted-foreground">
                {new Date(it.created_at).toLocaleString("mn-MN")}
              </span>
            </div>
            {it.note && <p className="mt-1 text-sm text-muted-foreground">{it.note}</p>}
          </li>
        );
      })}
    </ol>
  );
}
