import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, useEffect } from "react";
import { useNavigate, Link } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { ArrowLeft, Save, Globe, Eye, Upload } from "lucide-react";
import { RichMarkdownEditor, MarkdownPreview } from "@/components/admin/RichMarkdownEditor";
import { uploadOptimized } from "@/lib/image";

const EMPTY_POST = {
  title: "", slug: "", excerpt: "", content: "", cover_image: "",
  tags: "", status: "draft" as const,
};

export function BlogEditor({ mode, postId }: Props) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [form, setForm] = useState(EMPTY_POST);
  const [preview, setPreview] = useState(false);

  const { data: existing } = useQuery({
    queryKey: ["admin-blog-post", postId],
    enabled: mode === "edit" && !!postId,
    queryFn: async () => {
      const { data } = await supabase.from("blog_posts").select("*").eq("id", postId!).maybeSingle();
      return data;
    },
  });

  useEffect(() => {
    if (existing) {
      setForm({
        title: existing.title ?? "",
        slug: existing.slug ?? "",
        excerpt: existing.excerpt ?? "",
        content: existing.content ?? "",
        cover_image: existing.cover_image ?? "",
        tags: (existing.tags ?? []).join(", "),
        status: (existing.status as any) ?? "draft",
      });
    }
  }, [existing]);

  useEffect(() => {
    if (mode === "new" && form.title && !form.slug) {
      const slug = form.title.toLowerCase()
        .replace(/[^a-z0-9\u0400-\u04ff]+/g, "-")
        .replace(/^-|-$/g, "");
      setForm((f) => ({ ...f, slug }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.title, mode]);

  const save = useMutation({
    mutationFn: async (publish: boolean) => {
      const payload: any = {
        title: form.title,
        slug: form.slug || undefined,
        excerpt: form.excerpt || null,
        content: form.content,
        cover_image: form.cover_image || null,
        tags: form.tags ? form.tags.split(",").map((t) => t.trim()).filter(Boolean) : [],
        status: publish ? "published" : "draft",
        author_id: user?.id ?? null,
      };
      if (publish && (!existing?.published_at || existing.status !== "published")) {
        payload.published_at = new Date().toISOString();
      }
      if (mode === "edit" && postId) {
        const { error } = await supabase.from("blog_posts").update(payload).eq("id", postId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("blog_posts").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: (_, publish) => {
      toast.success(publish ? "Нийтлэгдлээ!" : "Ноорог хадгалагдлаа");
      qc.invalidateQueries({ queryKey: ["admin-blog-posts"] });
      navigate({ to: "/admin/blog" });
    },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-6 md:p-8">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Link to="/admin/blog">
            <Button variant="ghost" size="icon"><ArrowLeft className="h-4 w-4" /></Button>
          </Link>
          <div>
            <h1 className="text-2xl font-bold">{mode === "new" ? "Нийтлэл бичих" : "Нийтлэл засах"}</h1>
            <p className="text-sm text-muted-foreground">{(form.status as string) === "published" ? "Нийтлэгдсэн" : "Ноорог"}</p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => setPreview(!preview)}>
            <Eye className="mr-1 h-4 w-4" /> {preview ? "Засах" : "Урьдчилан харах"}
          </Button>
          <Button variant="outline" onClick={() => save.mutate(false)} disabled={save.isPending}>
            <Save className="mr-1 h-4 w-4" /> Ноорог
          </Button>
          <Button onClick={() => save.mutate(true)} disabled={save.isPending || !form.title || !form.content}>
            <Globe className="mr-1 h-4 w-4" /> Нийтлэх
          </Button>
        </div>
      </div>

      {preview ? (
        <Card className="prose prose-sm max-w-none rounded-2xl p-8">
          {form.cover_image && <img src={form.cover_image} className="mb-6 h-64 w-full rounded-xl object-cover" alt={form.title} />}
          <h1 className="text-3xl font-bold">{form.title || "Гарчиг"}</h1>
          {form.excerpt && <p className="text-lg text-muted-foreground">{form.excerpt}</p>}
          <div className="mt-6 whitespace-pre-wrap text-sm leading-relaxed">{form.content || "Агуулга байхгүй"}</div>
        </Card>
      ) : (
        <div className="grid gap-5">
          <Card className="space-y-4 rounded-2xl p-6">
            <div>
              <Label>Гарчиг *</Label>
              <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Нийтлэлийн гарчиг" className="mt-1 text-lg font-medium" />
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <Label>URL Slug</Label>
                <Input value={form.slug} onChange={(e) => setForm({ ...form, slug: e.target.value })} placeholder="url-slug" className="mt-1 font-mono text-sm" />
                <p className="mt-0.5 text-xs text-muted-foreground">/blog/{form.slug || "..."}</p>
              </div>
              <div>
                <Label>Нүүрний зурагны URL</Label>
                <Input value={form.cover_image} onChange={(e) => setForm({ ...form, cover_image: e.target.value })} placeholder="https://..." className="mt-1" />
              </div>
            </div>
            <div>
              <Label>Хураангуй</Label>
              <Textarea value={form.excerpt} onChange={(e) => setForm({ ...form, excerpt: e.target.value })} placeholder="Нийтлэлийн богино тайлбар..." rows={2} className="mt-1" />
            </div>
            <div>
              <Label>Тагууд (таслалаар тусгаарлах)</Label>
              <Input value={form.tags} onChange={(e) => setForm({ ...form, tags: e.target.value })} placeholder="мэдээ, платформ, мерчант" className="mt-1" />
            </div>
          </Card>

          <Card className="rounded-2xl p-6">
            <Label>Агуулга *</Label>
            <Textarea
              value={form.content}
              onChange={(e) => setForm({ ...form, content: e.target.value })}
              placeholder="Нийтлэлийн агуулгыг энд бичнэ үү..."
              rows={20}
              className="mt-2 resize-none font-mono text-sm leading-relaxed"
            />
            <p className="mt-1 text-xs text-muted-foreground">{form.content.length} тэмдэгт</p>
          </Card>
        </div>
      )}
    </div>
  );
}
