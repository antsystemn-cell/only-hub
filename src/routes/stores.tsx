import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Search } from "lucide-react";

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
    <div className="min-h-screen bg-background">
      <header className="border-b border-border">
        <div className="container mx-auto flex h-16 items-center justify-between px-4">
          <Link to="/" className="text-2xl font-bold">Only</Link>
          <Link to="/merchant/register"><Button>Дэлгүүр нээх</Button></Link>
        </div>
      </header>

      <div className="container mx-auto px-4 py-10">
        <h1 className="text-3xl font-bold">Бүх дэлгүүрүүд</h1>
        <div className="mt-6 flex max-w-md items-center gap-2">
          <Search className="h-4 w-4 text-muted-foreground" />
          <Input placeholder="Дэлгүүр хайх..." value={q} onChange={(e) => setQ(e.target.value)} />
        </div>

        {isLoading ? (
          <p className="mt-10 text-muted-foreground">Уншиж байна...</p>
        ) : filtered.length === 0 ? (
          <p className="mt-10 text-muted-foreground">Дэлгүүр олдсонгүй.</p>
        ) : (
          <div className="mt-8 grid gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
            {filtered.map((m) => (
              <Link key={m.id} to="/store/$merchantSlug" params={{ merchantSlug: m.slug }}>
                <Card className="flex h-full flex-col items-center rounded-2xl p-6 text-center transition-all hover:border-primary">
                  {m.logo_url ? (
                    <img src={m.logo_url} alt={m.name} className="mb-3 h-16 w-16 rounded-full object-cover" />
                  ) : (
                    <div className="mb-3 flex h-16 w-16 items-center justify-center rounded-full bg-muted text-2xl font-bold">{m.name[0]}</div>
                  )}
                  <h3 className="font-semibold">{m.name}</h3>
                  <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{m.description ?? "Дэлгүүр үзэх"}</p>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
