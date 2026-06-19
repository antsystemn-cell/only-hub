import { createFileRoute, Link } from "@tanstack/react-router";
import { Heart, Trash2, ShoppingBag } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { fmtMnt } from "@/lib/format";
import { wishlist, useWishlist } from "@/lib/wishlist";
import { useAuth } from "@/hooks/use-auth";
import { SiteHeader } from "@/components/site/SiteHeader";
import { SiteFooter } from "@/components/site/SiteFooter";

export const Route = createFileRoute("/wishlist")({
  head: () => ({ meta: [{ title: "Хүссэн жагсаалт — Only" }] }),
  component: WishlistPage,
});

function WishlistPage() {
  const items = useWishlist();
  const { user } = useAuth();

  return (
    <div className="min-h-screen bg-[#fafafa]">
      <SiteHeader />
      <div className="container mx-auto max-w-5xl px-4 py-8">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="flex items-center gap-2 text-2xl font-bold">
              <Heart className="h-6 w-6 text-rose-500 fill-rose-500" />
              Хүссэн жагсаалт
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {user
                ? `${items.length} бараа • Бүх төхөөрөмжид автоматаар хадгалагдана`
                : `${items.length} бараа • Нэвтэрвэл бусад төхөөрөмжид хадгалагдана`}
            </p>
          </div>
          {!user && items.length > 0 && (
            <Link to="/login">
              <Button variant="outline">Нэвтрэх</Button>
            </Link>
          )}
        </div>

        {items.length === 0 ? (
          <Card className="rounded-2xl p-12 text-center">
            <Heart className="mx-auto h-12 w-12 text-muted-foreground/40" />
            <h2 className="mt-4 text-lg font-semibold">Хүссэн жагсаалт хоосон байна</h2>
            <p className="mt-1 text-sm text-muted-foreground">Барааны хуудаснаас ♡ дээр дарж нэмнэ үү.</p>
            <Link to="/" className="mt-5 inline-block">
              <Button className="bg-orange-500 hover:bg-orange-600">Бараа үзэх</Button>
            </Link>
          </Card>
        ) : (
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            {items.map((it) => (
              <Card key={it.productId} className="group overflow-hidden rounded-2xl border-border/60 bg-white">
                <Link
                  to="/store/$merchantSlug/product/$productSlug"
                  params={{ merchantSlug: it.merchantSlug ?? "", productSlug: it.productSlug ?? it.productId }}
                  disabled={!it.merchantSlug}
                >
                  <div className="relative aspect-square bg-muted">
                    {it.image ? (
                      <img src={it.image} alt={it.name} className="h-full w-full object-cover transition group-hover:scale-105" loading="lazy" />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-muted-foreground">
                        <ShoppingBag className="h-8 w-8" />
                      </div>
                    )}
                  </div>
                  <div className="p-2.5">
                    <h3 className="line-clamp-2 min-h-[2.25rem] text-xs font-medium leading-tight group-hover:text-orange-600 sm:text-[13px]">{it.name}</h3>
                    <div className="mt-1 text-sm font-bold text-orange-600">{fmtMnt(it.price)}</div>
                  </div>
                </Link>
                <div className="border-t border-border/40 px-2.5 py-1.5">
                  <button
                    onClick={() => wishlist.remove(it.productId)}
                    className="inline-flex items-center gap-1 text-xs text-muted-foreground transition hover:text-rose-600"
                  >
                    <Trash2 className="h-3 w-3" /> Хасах
                  </button>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>
      <SiteFooter />
    </div>
  );
}
