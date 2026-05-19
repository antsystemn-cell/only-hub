import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { AccountNav } from "@/components/AccountNav";

export const Route = createFileRoute("/blog")({
  head: () => ({
    meta: [
      { title: "Блог — Only платформ" },
      { name: "description", content: "Only платформын мэдээ, нийтлэлүүд." },
    ],
  }),
  component: BlogListPage,
});

function BlogListPage() {
  const { data: posts = [] } = useQuery({
    queryKey: ["public-blog-posts"],
    queryFn: async () => {
      const { data } = await supabase
        .from("blog_posts")
        .select("id,title,slug,excerpt,cover_image,tags,view_count,published_at")
        .eq("status", "published")
        .order("published_at", { ascending: false });
      return data ?? [];
    },
  });

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border">
        <div className="container mx-auto flex h-16 items-center justify-between px-4">
          <Link to="/" className="text-2xl font-bold">Only</Link>
          <nav className="flex items-center gap-2">
            <Link to="/stores" className="text-sm text-muted-foreground hover:text-foreground">Дэлгүүрүүд</Link>
            <AccountNav />
          </nav>
        </div>
      </header>
      <div className="container mx-auto px-4 py-10">
        <h1 className="text-3xl font-bold">Блог</h1>
        {posts.length === 0 ? (
          <p className="mt-8 text-muted-foreground">Одоогоор нийтлэл алга байна.</p>
        ) : (
          <div className="mt-8 grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {posts.map((p: any) => (
              <Link key={p.id} to="/blog/$slug" params={{ slug: p.slug }}>
                <Card className="group h-full overflow-hidden rounded-2xl transition-all hover:border-primary">
                  {p.cover_image && <img src={p.cover_image} className="h-48 w-full object-cover" alt={p.title} />}
                  <div className="p-5">
                    <div className="mb-2 flex flex-wrap gap-1">
                      {(p.tags ?? []).map((t: string) => (
                        <span key={t} className="rounded-full bg-muted px-2 py-0.5 text-[10px]">{t}</span>
                      ))}
                    </div>
                    <h2 className="font-semibold transition-colors group-hover:text-primary">{p.title}</h2>
                    {p.excerpt && <p className="mt-1 line-clamp-3 text-sm text-muted-foreground">{p.excerpt}</p>}
                    <p className="mt-3 text-xs text-muted-foreground">
                      {p.published_at ? new Date(p.published_at).toLocaleDateString("mn-MN") : ""}
                      {p.view_count > 0 && ` · 👁 ${p.view_count}`}
                    </p>
                  </div>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
