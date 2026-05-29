import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { TiptapViewer } from "@/components/admin/TiptapEditor";

export const Route = createFileRoute("/blog/$slug")({ component: BlogPostPage });

function BlogPostPage() {
  const { slug } = Route.useParams();
  const { data: post, isLoading } = useQuery({
    queryKey: ["blog-post", slug],
    queryFn: async () => {
      const { data } = await supabase
        .from("blog_posts")
        .select("*")
        .eq("slug", slug)
        .eq("status", "published")
        .maybeSingle();
      return data;
    },
  });

  useEffect(() => {
    if (post?.id) {
      supabase
        .from("blog_posts")
        .update({ view_count: (post.view_count ?? 0) + 1 })
        .eq("id", post.id)
        .then(() => {});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [post?.id]);

  if (isLoading) return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
    </div>
  );
  if (!post) return <div className="flex min-h-screen items-center justify-center text-muted-foreground">Нийтлэл олдсонгүй</div>;

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border">
        <div className="container mx-auto flex h-16 items-center justify-between px-4">
          <Link to="/" className="text-2xl font-bold">Only</Link>
          <Link to="/blog" className="text-sm text-muted-foreground hover:text-foreground">← Блог</Link>
        </div>
      </header>
      <article className="container mx-auto max-w-2xl px-4 py-10">
        {post.cover_image && <img src={post.cover_image} className="mb-8 h-64 w-full rounded-2xl object-cover" alt={post.title} />}
        <div className="mb-4 flex flex-wrap gap-1">
          {(post.tags ?? []).map((t: string) => (
            <span key={t} className="rounded-full bg-muted px-2 py-0.5 text-xs">{t}</span>
          ))}
        </div>
        <h1 className="text-3xl font-bold">{post.title}</h1>
        {post.excerpt && <p className="mt-3 text-lg text-muted-foreground">{post.excerpt}</p>}
        <p className="mt-2 text-sm text-muted-foreground">
          {post.published_at ? new Date(post.published_at).toLocaleDateString("mn-MN", { year: "numeric", month: "long", day: "numeric" }) : ""}
          {post.view_count > 0 && ` · 👁 ${post.view_count} үзсэн`}
        </p>
        <div className="mt-8"><TiptapViewer html={post.content ?? ""} /></div>
      </article>
    </div>
  );
}
