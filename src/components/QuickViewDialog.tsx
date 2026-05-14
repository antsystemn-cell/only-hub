import { useEffect, useRef } from "react";
import { Link } from "@tanstack/react-router";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogClose,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { fmtMnt } from "@/lib/format";
import { Store, X } from "lucide-react";

export type QuickViewProduct = {
  id: string;
  name: string;
  price: number | string;
  original_price?: number | string | null;
  image_url?: string | null;
  thumbnail_url?: string | null;
  is_new?: boolean | null;
  is_on_sale?: boolean | null;
  description?: string | null;
  slug?: string | null;
  merchant_id?: string | null;
};

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  product: QuickViewProduct | null;
  merchantName?: string;
  merchantSlug?: string;
};

/**
 * Accessible quick-view modal.
 *
 * Built on Radix Dialog (via shadcn/ui), so the following are guaranteed:
 *   - Focus trap inside the dialog while open
 *   - Esc key closes the dialog
 *   - Focus returns to the trigger element on close
 *   - Background is inert + scroll locked
 *   - Overlay click closes the dialog
 *
 * On top of that we add: explicit visible X close button (mobile-friendly tap target),
 * an initial-focus target (the primary CTA) for a clear keyboard/screen-reader entry point,
 * and a DialogDescription for screen readers.
 */
export function QuickViewDialog({ open, onOpenChange, product, merchantName, merchantSlug }: Props) {
  const initialFocusRef = useRef<HTMLAnchorElement | HTMLButtonElement | null>(null);

  // Make sure no leftover scroll-lock / pointer-events stays on <body> if dialog
  // is unmounted mid-transition (defensive cleanup).
  useEffect(() => {
    return () => {
      if (typeof document !== "undefined") {
        document.body.style.removeProperty("pointer-events");
      }
    };
  }, []);

  if (!product) return null;
  const img = product.thumbnail_url || product.image_url;
  const hasDiscount =
    product.original_price != null && Number(product.original_price) > Number(product.price);
  const productSlugOrId = product.slug || product.id;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        aria-describedby="quickview-desc"
        onOpenAutoFocus={(e) => {
          // Direct initial focus to the primary CTA instead of the (auto-focused)
          // shadcn Close button — better screen-reader announcement order.
          if (initialFocusRef.current) {
            e.preventDefault();
            initialFocusRef.current.focus();
          }
        }}
        className="max-w-3xl gap-0 overflow-hidden p-0 sm:rounded-2xl"
      >
        {/* Visually hidden description for screen readers */}
        <DialogDescription id="quickview-desc" className="sr-only">
          {product.name} — үнэ {fmtMnt(Number(product.price))}
          {merchantName ? `, ${merchantName} дэлгүүр` : ""}.
          Дэлгэрэнгүй үзэх эсвэл дэлгүүр рүү шилжих.
        </DialogDescription>

        {/* Explicit visible close button (overrides shadcn default with bigger tap target) */}
        <DialogClose
          aria-label="Хаах"
          className="absolute right-3 top-3 z-20 inline-flex h-9 w-9 items-center justify-center rounded-full bg-background/90 text-foreground shadow-md ring-offset-background backdrop-blur transition hover:bg-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        >
          <X className="h-4 w-4" />
        </DialogClose>

        <div className="grid gap-0 sm:grid-cols-2">
          <div className="relative aspect-square bg-muted">
            {img ? (
              <img src={img} alt={product.name} className="h-full w-full object-cover" />
            ) : (
              <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                Зураг алга
              </div>
            )}
            <div className="absolute left-3 top-3 flex flex-col gap-1">
              {product.is_new && (
                <Badge className="bg-primary text-primary-foreground hover:bg-primary">ШИНЭ</Badge>
              )}
              {product.is_on_sale && (
                <Badge className="bg-destructive text-destructive-foreground hover:bg-destructive">
                  SALE
                </Badge>
              )}
            </div>
          </div>

          <div className="flex flex-col p-5 pr-12 sm:p-6 sm:pr-12">
            <DialogHeader className="space-y-1.5 text-left">
              <DialogTitle className="pr-2 text-lg sm:text-xl">{product.name}</DialogTitle>
              {merchantName && (
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Store className="h-3.5 w-3.5" /> {merchantName}
                </div>
              )}
            </DialogHeader>

            <div className="mt-4 flex items-baseline gap-2.5">
              <span className="text-2xl font-bold">{fmtMnt(Number(product.price))}</span>
              {hasDiscount && (
                <span className="text-sm text-muted-foreground line-through">
                  {fmtMnt(Number(product.original_price))}
                </span>
              )}
            </div>

            {product.description && (
              <p className="mt-3 line-clamp-5 text-sm text-muted-foreground">
                {product.description}
              </p>
            )}

            <div className="mt-auto flex flex-col gap-2 pt-5 sm:flex-row">
              {merchantSlug ? (
                <Link
                  ref={initialFocusRef as React.Ref<HTMLAnchorElement>}
                  to="/store/$merchantSlug/product/$productSlug"
                  params={{ merchantSlug, productSlug: productSlugOrId }}
                  className="flex-1"
                  onClick={() => onOpenChange(false)}
                >
                  <Button className="w-full">Дэлгэрэнгүй үзэх</Button>
                </Link>
              ) : null}
              {merchantSlug && (
                <Link
                  to="/store/$merchantSlug"
                  params={{ merchantSlug }}
                  className="flex-1"
                  onClick={() => onOpenChange(false)}
                >
                  <Button variant="outline" className="w-full">
                    Дэлгүүр үзэх
                  </Button>
                </Link>
              )}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
