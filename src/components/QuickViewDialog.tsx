import { Link } from "@tanstack/react-router";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { fmtMnt } from "@/lib/format";
import { Store } from "lucide-react";

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

export function QuickViewDialog({ open, onOpenChange, product, merchantName, merchantSlug }: Props) {
  if (!product) return null;
  const img = product.thumbnail_url || product.image_url;
  const hasDiscount = product.original_price != null && Number(product.original_price) > Number(product.price);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl overflow-hidden p-0 sm:rounded-2xl">
        <div className="grid gap-0 sm:grid-cols-2">
          <div className="relative aspect-square bg-muted">
            {img ? (
              <img src={img} alt={product.name} className="h-full w-full object-cover" />
            ) : (
              <div className="flex h-full items-center justify-center text-sm text-muted-foreground">Зураг алга</div>
            )}
            <div className="absolute left-2 top-2 flex flex-col gap-1">
              {product.is_new && <Badge className="bg-primary text-primary-foreground">ШИНЭ</Badge>}
              {product.is_on_sale && <Badge className="bg-destructive text-destructive-foreground">SALE</Badge>}
            </div>
          </div>
          <div className="flex flex-col p-5 sm:p-6">
            <DialogHeader className="space-y-1.5 text-left">
              <DialogTitle className="text-lg sm:text-xl">{product.name}</DialogTitle>
              {merchantName && (
                <DialogDescription className="flex items-center gap-1.5 text-xs">
                  <Store className="h-3.5 w-3.5" /> {merchantName}
                </DialogDescription>
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
              <p className="mt-3 line-clamp-5 text-sm text-muted-foreground">{product.description}</p>
            )}

            <div className="mt-auto flex flex-col gap-2 pt-5 sm:flex-row">
              {merchantSlug && product.slug ? (
                <Link
                  to="/store/$merchantSlug/product/$productSlug"
                  params={{ merchantSlug, productSlug: product.slug }}
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
                  <Button variant="outline" className="w-full">Дэлгүүр үзэх</Button>
                </Link>
              )}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
