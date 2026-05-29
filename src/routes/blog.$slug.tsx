import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { TiptapViewer } from "@/components/admin/TiptapEditor";
import { AccountNav } from "@/components/AccountNav";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ArrowLeft, Calendar, Clock, Eye, Share2 } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/blog/$slug")({
  component: BlogPostPage,
  errorComponent: ({ error, reset }) => (
    <div className="flex min-h-screen flex-col items-center justify-center gap-3 px-4 text-center">
      <p className="text-lg font-semibold">Нийтлэлийг ачаалахад алдаа гарлаа</p>
      <p className="text-sm text-muted-foreground">{error.message}</p>
      <Button onClick={reset}>Дахин оролдох</Button>
    </div>
  ),
  notFoundComponent: () => (
    <div className="flex min-h-screen flex-col items-center justify-center gap-3 px-4 text-center">
      <p className="text-lg font-semibold">Нийтлэл олдсонгүй</p>
      <Link to="/blog"><Button variant="outline">Бүх нийтлэл рүү</Button></Link>
    </div>
  ),
});

function readingTime(html: string) {
  const text = html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  const words = text ? text.split(" ").length : 0;
  return Math.max(1, Math.round(words / 200));
}

function BlogPostPage() {
  const { slug } = Route.useParams();

  const { data: post, isLoading } = useQuery({
    queryKey: ["blog-post", slug],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("blog_posts")
        .select("*")
        .eq("slug", slug)
        .eq("status", "published")
        .maybeSingle();
      if (error) throw error;
      if (!data) throw notFound();
      return data;
    },
  });

  const { data: related = [] } = useQuery({
    queryKey: ["blog-related", post?.id],
    enabled: !!post?.id,
    queryFn: async () => {
      const { data } = await supabase
        .from("blog_posts")
        .select("id,title,slug,cover_image,excerpt,published_at")
        .eq("status", "published")
        .neq("id", post!.id)
        .order("published_at", { ascending: false })
        .limit(3);
      return data ?? [];
    },
  });

  useEffect(() => {
    if (!post?.id) return;
    supabase.from("blog_posts").update({ view_count: (post.view_count ?? 0) + 1 }).eq("id", post.id).then(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [post?.id]);

  const minutes = useMemo(() => readingTime(post?.content ?? ""), [post?.content]);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background">
        <div className="container mx-auto max-w-3xl animate-pulse px-4 py-16">
          <div className="h-4 w-24 rounded bg-muted" />
          <div className="mt-6 h-10 w-3/4 rounded bg-muted" />
          <div className="mt-3 h-4 w-1/2 rounded bg-muted" />
          <div className="mt-8 h-72 w-full rounded-2xl bg-muted" />
          <div className="mt-8 space-y-3">
            {Array.from({ length: 6 }).map((_, i) => <div key={i} className="h-4 w-full rounded bg-muted" />)}
          </div>
        </div>
      </div>
    );
  }
  if (!post) return null;

  const published = post.published_at ? new Date(post.published_at) : null;

  async function share() {
    const url = window.location.href;
    if (navigator.share) {
      try { await navigator.share({ title: post!.title, text: post!.excerpt ?? "", url }); return; } catch {}
    }
    await navigator.clipboard.writeText(url);
    toast.success("Холбоос хуулагдлаа");
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-30 border-b border-border bg-background/80 backdrop-blur">
        <div className="container mx-auto flex h-16 items-center justify-between px-4">
          <Link to="/" className="text-2xl font-bold">Only</Link>
          <nav className="flex items-center gap-3">
            <Link to="/blog" className="text-sm text-muted-foreground hover:text-foreground">Блог</Link>
            <Link to="/stores" className="text-sm text-muted-foreground hover:text-foreground">Дэлгүүрүүд</Link>
            <AccountNav />
          </nav>
        </div>
      </header>

      {/* Hero */}
      <section className="relative overflow-hidden border-b border-border bg-gradient-to-b from-muted/40 to-background">
        <div className="container mx-auto max-w-3xl px-4 py-12 md:py-16">
          <Link to="/blog" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-4 w-4" /> Бүх нийтлэл
          </Link>
          {(post.tags ?? []).length > 0 && (
            <div className="mt-6 flex flex-wrap gap-1.5">
              {(post.tags ?? []).map((t: string) => (
                <span key={t} className="rounded-full bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary">{t}</span>
              ))}
            </div>
          )}
          <h1 className="mt-4 text-3xl font-bold leading-tight tracking-tight md:text-5xl">{post.title}</h1>
          {post.excerpt && <p className="mt-4 text-lg leading-relaxed text-muted-foreground md:text-xl">{post.excerpt}</p>}
          <div className="mt-6 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-muted-foreground">
            {published && (
              <span className="inline-flex items-center gap-1.5">
                <Calendar className="h-4 w-4" />
                {published.toLocaleDateString("mn-MN", { year: "numeric", month: "long", day: "numeric" })}
              </span>
            )}
            <span className="inline-flex items-center gap-1.5"><Clock className="h-4 w-4" /> {minutes} мин уншина</span>
            {post.view_count > 0 && (
              <span className="inline-flex items-center gap-1.5"><Eye className="h-4 w-4" /> {post.view_count} үзсэн</span>
            )}
            <Button variant="ghost" size="sm" className="ml-auto h-8" onClick={share}>
              <Share2 className="mr-1.5 h-4 w-4" /> Хуваалцах
            </Button>
          </div>
        </div>
      </section>

      {/* Cover */}
      {post.cover_image && (
        <div className="container mx-auto max-w-4xl px-4">
          <img
            src={post.cover_image}
            alt={post.title}
            className="-mt-2 mb-2 h-64 w-full rounded-2xl object-cover shadow-lg md:h-[420px]"
          />
        </div>
      )}

      {/* Body */}
      <article className="container mx-auto max-w-3xl px-4 py-10 md:py-14">
        <TiptapViewer html={post.content ?? ""} />

        <div className="mt-12 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-6">
          <Link to="/blog">
            <Button variant="outline"><ArrowLeft className="mr-2 h-4 w-4" /> Бүх нийтлэл</Button>
          </Link>
          <Button variant="ghost" onClick={share}><Share2 className="mr-2 h-4 w-4" /> Хуваалцах</Button>
        </div>
      </article>

      {/* Related */}
      {related.length > 0 && (
        <section className="border-t border-border bg-muted/30">
          <div className="container mx-auto max-w-5xl px-4 py-12">
            <h2 className="text-2xl font-bold">Өөр сонирхолтой нийтлэлүүд</h2>
            <div className="mt-6 grid gap-5 md:grid-cols-3">
              {related.map((p: any) => (
                <Link key={p.id} to="/blog/$slug" params={{ slug: p.slug }}>
                  <Card className="group h-full overflow-hidden rounded-2xl transition-all hover:border-primary hover:shadow-md">
                    {p.cover_image && <img src={p.cover_image} className="h-40 w-full object-cover" alt={p.title} />}
                    <div className="p-4">
                      <h3 className="font-semibold leading-snug transition-colors group-hover:text-primary">{p.title}</h3>
                      {p.excerpt && <p className="mt-1.5 line-clamp-2 text-sm text-muted-foreground">{p.excerpt}</p>}
                      {p.published_at && (
                        <p className="mt-3 text-xs text-muted-foreground">
                          {new Date(p.published_at).toLocaleDateString("mn-MN")}
                        </p>
                      )}
                    </div>
                  </Card>
                </Link>
              ))}
            </div>
          </div>
        </section>
      )}
    </div>
  );
}
