import { Badge } from "@/components/ui/badge";
import { Globe2, Clock } from "lucide-react";
import { getForeignSourceDef } from "@/lib/foreign-orders/sources";
import type { Database } from "@/integrations/supabase/types";

type Product = {
  product_type?: Database["public"]["Enums"]["product_type"] | null;
  foreign_source?: Database["public"]["Enums"]["foreign_source"] | null;
  default_delivery_min_days?: number | null;
  default_delivery_max_days?: number | null;
};

export function isForeignOrder(p: Product | null | undefined): boolean {
  return !!p && p.product_type === "FOREIGN_ORDER";
}

export function deliveryRangeLabel(p: Product): string {
  const min = p.default_delivery_min_days ?? null;
  const max = p.default_delivery_max_days ?? null;
  if (min && max && min !== max) return `${min}-${max} өдөр`;
  if (max) return `${max} өдөр`;
  if (min) return `${min} өдөр`;
  return "10-14 өдөр";
}

/** Compact inline badge for product cards / lists. */
export function ForeignOrderInlineBadge({ product, className = "" }: { product: Product; className?: string }) {
  if (!isForeignOrder(product)) return null;
  return (
    <span
      className={
        "inline-flex items-center gap-1 rounded-md bg-indigo-500/95 px-1.5 py-0.5 text-[10px] font-semibold text-white shadow-sm " +
        className
      }
    >
      <Globe2 className="h-3 w-3" />
      Захиалгаар · {deliveryRangeLabel(product)}
    </span>
  );
}

/** Full info panel for PDP — explains foreign-order delivery flow. */
export function ForeignOrderPanel({ product }: { product: Product & { source_name?: string | null; source_country?: string | null } }) {
  if (!isForeignOrder(product)) return null;
  const def = getForeignSourceDef(product.foreign_source ?? null);
  const label = def?.badgeLabel ?? "Гадаадаас захиалгаар";
  const country = product.source_country ?? def?.country ?? "";
  return (
    <div className="mt-4 overflow-hidden rounded-xl border border-indigo-200 bg-gradient-to-br from-indigo-50 to-white">
      <div className="flex items-center gap-2 border-b border-indigo-100 bg-indigo-500/5 px-3 py-2">
        <Globe2 className="h-4 w-4 text-indigo-600" />
        <div className="text-sm font-semibold text-indigo-900">{label}</div>
        {country && (
          <Badge variant="outline" className="ml-auto border-indigo-200 bg-white text-[10px] text-indigo-700">
            {country}
          </Badge>
        )}
      </div>
      <div className="space-y-2 px-3 py-3 text-sm text-foreground/80">
        <div className="flex items-center gap-2">
          <Clock className="h-4 w-4 text-indigo-600" />
          <span>
            Захиалга хийгдсэнээс хойш ойролцоогоор{" "}
            <span className="font-semibold text-foreground">{deliveryRangeLabel(product)}</span>-н дотор гарт хүрнэ.
          </span>
        </div>
        <ul className="ml-6 list-disc space-y-1 text-xs text-muted-foreground">
          <li>Төлбөр баталгаажсаны дараа гадны эх сурвалжаас худалдан авна.</li>
          <li>Хүлээн авах хугацаа гааль, ачааны нислэгээс шалтгаалан өөрчлөгдөж болно.</li>
          <li>Үнэ нь захиалгын мөчид түгжигдсэн — дараагийн ханш өөрчлөгдөхөд танд нөлөөлөхгүй.</li>
        </ul>
      </div>
    </div>
  );
}

/** Country origin badge — flag only. Renders only for KR/CN. */
export function CountryOriginBadge({
  product,
  size = "sm",
  className = "",
}: {
  product: { source_country?: string | null; default_delivery_min_days?: number | null; default_delivery_max_days?: number | null };
  size?: "xs" | "sm" | "md";
  className?: string;
}) {
  const c = product.source_country;
  if (c !== "KR" && c !== "CN") return null;
  const flag = c === "KR" ? "🇰🇷" : "🇨🇳";
  const grad =
    c === "KR"
      ? "from-rose-500 to-indigo-600"
      : "from-red-500 to-yellow-500";
  const days = deliveryRangeLabel(product as Product);
  const sz =
    size === "xs"
      ? "h-6 w-6"
      : size === "md"
      ? "h-9 w-9"
      : "h-7 w-7";
  const flagSz =
    size === "xs" ? "text-base" : size === "md" ? "text-2xl" : "text-xl";
  return (
    <span
      className={`inline-flex items-center justify-center rounded-full bg-gradient-to-br ${grad} shadow-sm ring-1 ring-white/40 ${sz} ${className}`}
      title={`${c === "KR" ? "Солонгос" : "Хятад"}аас захиалгаар • ${days}`}
    >
      <span className={`leading-none ${flagSz}`}>{flag}</span>
    </span>
  );
}

