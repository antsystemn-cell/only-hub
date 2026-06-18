import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Search } from "lucide-react";
import { SiteHeader } from "@/components/site/SiteHeader";
import { SiteFooter } from "@/components/site/SiteFooter";

export const Route = createFileRoute("/stores")({
  head: () => ({
    meta: [
      { title: "Бүх дэлгүүрүүд — Only" },
      { name: "description", content: "Only платформ дээрх бүх идэвхтэй дэлгүүрүүдийг үзнэ үү." },
    ],
  }),
  component: StoresPage,
});

function StoresPage() {
  const [q, setQ] = useState("");
  const { data: merchants, isLoading } = useQuery({
    queryKey: ["all-merchants"],
    queryFn: async () => {
      const { data } = await supabase.from("merchants").select("id,name,slug,logo_url,description").eq("is_active", true).order("created_at", { ascending: false });
      return data ?? [];
    },
  });

  const filtered = (merchants ?? []).filter((m) => m.name.toLowerCase().includes(q.toLowerCase()));

  return (
    <div className="min-h-screen bg-[#fafafa]">
      <SiteHeader />

      <div className="container mx-auto px-4 py-8 sm:py-10">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold sm:text-3xl">Бүх дэлгүүрүүд</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Only платформ дээрх идэвхтэй мерчантуудыг үзнэ үү
            </p>
          </div>
          <div className="relative w-full max-w-sm">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Дэлгүүр хайх..."
              value={q}
              onChange={(e) => setQ(e.target.value)}
              className="h-10 rounded-full pl-9"
            />
          </div>
        </div>

        {isLoading ? (
          <p className="mt-10 text-muted-foreground">Уншиж байна...</p>
        ) : filtered.length === 0 ? (
          <p className="mt-10 text-muted-foreground">Дэлгүүр олдсонгүй.</p>
        ) : (
          <div className="mt-8 grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3 lg:grid-cols-4">
            {filtered.map((m) => (
              <Link key={m.id} to="/store/$merchantSlug" params={{ merchantSlug: m.slug }}>
                <Card className="flex h-full flex-col items-center rounded-2xl border-border/60 p-5 text-center shadow-sm transition-all hover:-translate-y-0.5 hover:border-orange-300 hover:shadow-md sm:p-6">
                  {m.logo_url ? (
                    <img src={m.logo_url} alt={m.name} className="mb-3 h-16 w-16 rounded-full object-cover ring-2 ring-orange-100" />
                  ) : (
                    <div className="mb-3 flex h-16 w-16 items-center justify-center rounded-full bg-orange-50 text-xl font-bold text-orange-600">
                      {m.name[0]}
                    </div>
                  )}
                  <h3 className="font-semibold">{m.name}</h3>
                  <p className="mt-1 line-clamp-2 text-xs text-muted-foreground sm:text-sm">
                    {m.description ?? "Дэлгүүр үзэх"}
                  </p>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </div>

      <SiteFooter />
    </div>
  );
}
