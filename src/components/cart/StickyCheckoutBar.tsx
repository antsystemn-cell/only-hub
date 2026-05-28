import { Button } from "@/components/ui/button";
import { fmtMnt } from "@/lib/format";
import { ShoppingBag } from "lucide-react";

type Props = {
  total: number;
  qty: number;
  label?: string;
  disabled?: boolean;
  onClick: () => void;
};

export function StickyCheckoutBar({ total, qty, label = "Үргэлжлүүлэх", disabled, onClick }: Props) {
  if (qty === 0) return null;
  return (
    <div className="fixed inset-x-0 bottom-0 z-40 border-t bg-background/95 p-3 shadow-[0_-4px_12px_-4px_rgba(0,0,0,0.1)] backdrop-blur lg:hidden">
      <div className="container mx-auto flex items-center gap-3">
        <div className="flex-1">
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            <ShoppingBag className="h-3.5 w-3.5" /> {qty} бараа
          </div>
          <div className="text-lg font-bold leading-tight">{fmtMnt(total)}</div>
        </div>
        <Button size="lg" className="h-12 min-w-[140px]" disabled={disabled} onClick={onClick}>
          {label}
        </Button>
      </div>
    </div>
  );
}
