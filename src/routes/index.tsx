import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Store, ShoppingBag, TrendingUp, Sparkles } from "lucide-react";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Only — Монголын олон дэлгүүрт e-commerce платформ" },
      { name: "description", content: "Олон мерчантуудыг нэгтгэсэн нэгдсэн онлайн худалдааны платформ. Дэлгүүрээ нээж, бүтээгдэхүүнээ зар." },
      { property: "og:title", content: "Only — Монголын онлайн худалдааны платформ" },
      { property: "og:description", content: "Олон мерчантуудыг нэгтгэсэн платформ." },
    ],
  }),
  component: Index,
});

function Index() {
  const { data: merchants } = useQuery({
    queryKey: ["home-merchants"],
    queryFn: async () => {
      const { data } = await supabase.from("merchants").select("id,name,slug,logo_url,description").eq("is_active", true).limit(8);
      return data ?? [];
    },
  });

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border">
        <div className="container mx-auto flex h-16 items-center justify-between px-4">
          <Link to="/" className="text-2xl font-bold tracking-tight text-foreground">Only</Link>
          <nav className="flex items-center gap-2">
            <Link to="/stores"><Button variant="ghost">Дэлгүүрүүд</Button></Link>
            <Link to="/merchant/login"><Button variant="ghost">Нэвтрэх</Button></Link>
            <Link to="/merchant/register"><Button>Дэлгүүр нээх</Button></Link>
          </nav>
        </div>
      </header>

      <section className="container mx-auto px-4 py-20 text-center">
        <div className="mx-auto max-w-3xl">
          <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-border px-4 py-1.5 text-sm">
            <Sparkles className="h-4 w-4" /> Шинэ үеийн e-commerce платформ
          </div>
          <h1 className="text-5xl font-bold tracking-tight text-foreground md:text-6xl">
            Нэг платформ. <br /> Олон дэлгүүр.
          </h1>
          <p className="mx-auto mt-6 max-w-xl text-lg text-muted-foreground">
            Only нь Монголын олон мерчантуудыг нэгтгэсэн нэгдсэн худалдааны платформ. Худалдан авагч, борлуулагч хоёрыг хамгийн хялбар замаар холбоно.
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Link to="/stores"><Button size="lg">Дэлгүүр үзэх</Button></Link>
            <Link to="/merchant/register"><Button size="lg" variant="outline">Дэлгүүрээ нээх</Button></Link>
          </div>
        </div>
      </section>

      <section className="container mx-auto grid gap-6 px-4 py-16 md:grid-cols-3">
        {[
          { icon: Store, title: "Өөрийн дэлгүүр", desc: "Хэдхэн минутад өөрийн онлайн дэлгүүртэй болно." },
          { icon: ShoppingBag, title: "Бүх төлбөрийн систем", desc: "QPay, StorePay, бэлэн мөнгө — бүх боломж нэг дор." },
          { icon: TrendingUp, title: "Тайлан, статистик", desc: "Борлуулалт, захиалгаа бодит цагт хянана." },
        ].map((f) => (
          <Card key={f.title} className="rounded-2xl p-6">
            <f.icon className="mb-3 h-8 w-8 text-primary" />
            <h3 className="text-lg font-semibold">{f.title}</h3>
            <p className="mt-2 text-sm text-muted-foreground">{f.desc}</p>
          </Card>
        ))}
      </section>

      {merchants && merchants.length > 0 && (
        <section className="container mx-auto px-4 py-16">
          <div className="mb-8 flex items-end justify-between">
            <h2 className="text-3xl font-bold">Онцлох дэлгүүрүүд</h2>
            <Link to="/stores" className="text-sm text-primary hover:underline">Бүгдийг үзэх →</Link>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
            {merchants.map((m) => (
              <Link key={m.id} to="/store/$merchantSlug" params={{ merchantSlug: m.slug }}>
                <Card className="group flex h-full flex-col items-center rounded-2xl p-6 text-center transition-all hover:border-primary">
                  {m.logo_url ? (
                    <img src={m.logo_url} alt={m.name} className="mb-3 h-16 w-16 rounded-full object-cover" />
                  ) : (
                    <div className="mb-3 flex h-16 w-16 items-center justify-center rounded-full bg-muted text-2xl font-bold">{m.name[0]}</div>
                  )}
                  <h3 className="font-semibold group-hover:text-primary">{m.name}</h3>
                  <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{m.description ?? "Дэлгүүр үзэх"}</p>
                </Card>
              </Link>
            ))}
          </div>
        </section>
      )}

      <footer className="border-t border-border py-8 text-center text-sm text-muted-foreground">
        © {new Date().getFullYear()} Only Platform
      </footer>
    </div>
  );
}
