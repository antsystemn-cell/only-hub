import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { fmtMnt } from "@/lib/format";

export const Route = createFileRoute("/store/$merchantSlug")({ component: StorePage });

function StorePage() {
  const { merchantSlug } = Route.useParams();
  const { data: merchant } = useQuery({
    queryKey: ["merchant", merchantSlug],
    queryFn: async () => (await supabase.from("merchants").select("*").eq("slug", merchantSlug).maybeSingle()).data,
  });
  const { data: products = [] } = useQuery({
    queryKey: ["store-products", merchant?.id],
    enabled: !!merchant?.id,
    queryFn: async () => (await supabase.from("products").select("*").eq("merchant_id", merchant!.id).eq("is_active", true)).data ?? [],
  });

  if (!merchant) return <div className="flex min-h-screen items-center justify-center text-muted-foreground">Уншиж байна...</div>;

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border">
        <div className="container mx-auto flex h-16 items-center gap-3 px-4">
          <Link to="/" className="text-xl font-bold">Only</Link>
          <span className="text-muted-foreground">/</span>
          {merchant.logo_url && <img src={merchant.logo_url} className="h-8 w-8 rounded-full object-cover" />}
          <span className="font-semibold">{merchant.name}</span>
        </div>
      </header>
      <div className="container mx-auto px-4 py-10">
        <h1 className="text-3xl font-bold">{merchant.name}</h1>
        {merchant.description && <p className="mt-2 text-muted-foreground">{merchant.description}</p>}
        <div className="mt-8 grid gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
          {(products as any[]).map((p) => (
            <Link
              key={p.id}
              to="/store/$merchantSlug/product/$productSlug"
              params={{ merchantSlug, productSlug: p.slug || p.id }}
            >
              <Card className="overflow-hidden rounded-2xl transition hover:shadow-lg">
                {p.image_url && <img src={p.image_url} alt={p.name} className="h-48 w-full object-cover" />}
                <div className="p-4">
                  <div className="font-medium line-clamp-2">{p.name}</div>
                  <div className="mt-2 font-bold">{fmtMnt(p.price)}</div>
                </div>
              </Card>
            </Link>
          ))}
          {products.length === 0 && <p className="col-span-full py-10 text-center text-muted-foreground">Бараа алга</p>}
        </div>
      </div>
    </div>
  );
}
