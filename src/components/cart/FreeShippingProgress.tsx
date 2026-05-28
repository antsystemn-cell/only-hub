import { fmtMnt } from "@/lib/format";
import { Truck } from "lucide-react";

type Props = {
  freeThreshold: number | null;
  subtotal: number;
  amountToFree: number;
  reached: boolean;
};

export function FreeShippingProgress({ freeThreshold, subtotal, amountToFree, reached }: Props) {
  if (freeThreshold == null) return null;
  const pct = reached ? 100 : Math.min(100, Math.round((subtotal / freeThreshold) * 100));
  return (
    <div className="rounded-lg border bg-muted/30 p-3 text-sm">
      <div className="mb-2 flex items-center gap-2">
        <Truck className="h-4 w-4 text-primary" />
        {reached ? (
          <span className="font-medium text-emerald-600">Үнэгүй хүргэлт идэвхжсэн 🎉</span>
        ) : (
          <span>
            Үнэгүй хүргэлт хүртэл{" "}
            <span className="font-semibold text-foreground">{fmtMnt(amountToFree)}</span> үлдлээ
          </span>
        )}
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
        <div
          className="h-full bg-primary transition-all"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
