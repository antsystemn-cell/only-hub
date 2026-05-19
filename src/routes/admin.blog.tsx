import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader,
  AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, Eye, Globe, FileText } from "lucide-react";

export const Route = createFileRoute("/admin/blog")({ component: AdminBlogPage });

function AdminBlogPage() {
  const { isPlatformAdmin } = useAuth();
  const qc = useQueryClient();
  const [search, setSearch] = useState("");

  const postsQ = useQuery({
    queryKey: ["admin-blog-posts"],
    enabled: isPlatformAdmin,
    queryFn: async () => {
      const { data } = await supabase
        .from("blog_posts")
        .select("id,title,slug,excerpt,status,tags,view_count,published_at,created_at,cover_image")
        .order("created_at", { ascending: false });
      return data ?? [];
    },
  });

  const del = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("blog_posts").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Устгалаа"); qc.invalidateQueries({ queryKey: ["admin-blog-posts"] }); },
  });

  const toggleStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const patch: any = { status };
      if (status === "published") patch.published_at = new Date().toISOString();
      const { error } = await supabase.from("blog_posts").update(patch).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Шинэчиллээ"); qc.invalidateQueries({ queryKey: ["admin-blog-posts"] }); },
  });

  const filtered = ((postsQ.data ?? []) as any[]).filter((p) =>
    !search || p.title.toLowerCase().includes(search.toLowerCase())
  );
  const published = filtered.filter((p) => p.status === "published").length;
  const drafts = filtered.filter((p) => p.status === "draft").length;

  return (
    <div className="space-y-6 p-6 md:p-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Блог нийтлэл</h1>
          <p className="mt-1 text-sm text-muted-foreground">{published} нийтлэгдсэн · {drafts} ноорог</p>
        </div>
        <Link to="/admin/blog/new">
          <Button><Plus className="mr-2 h-4 w-4" /> Нийтлэл бичих</Button>
        </Link>
      </div>

      <div className="relative max-w-sm">
        <FileText className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input placeholder="Нийтлэл хайх..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
      </div>

      <div className="space-y-3">
        {postsQ.isLoading && <p className="text-muted-foreground">Уншиж байна...</p>}
        {filtered.map((p: any) => (
          <Card key={p.id} className="rounded-2xl p-4">
            <div className="flex items-start gap-4">
              {p.cover_image && (
                <img src={p.cover_image} className="h-16 w-24 shrink-0 rounded-xl object-cover" alt={p.title} />
              )}
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold">{p.title}</span>
                  <Badge variant={p.status === "published" ? "default" : "secondary"}>
                    {p.status === "published" ? "Нийтлэгдсэн" : "Ноорог"}
                  </Badge>
                  {(p.tags ?? []).map((t: string) => (
                    <span key={t} className="rounded-full bg-muted px-2 py-0.5 text-[10px]">{t}</span>
                  ))}
                </div>
                {p.excerpt && <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{p.excerpt}</p>}
                <div className="mt-1 flex gap-3 text-xs text-muted-foreground">
                  <span>/{p.slug}</span>
                  <span>👁 {p.view_count}</span>
                  {p.published_at && <span>{new Date(p.published_at).toLocaleDateString("mn-MN")}</span>}
                </div>
              </div>
              <div className="flex shrink-0 gap-1">
                {p.status === "draft" ? (
                  <Button size="sm" variant="outline" className="border-emerald-300 text-emerald-600"
                    onClick={() => toggleStatus.mutate({ id: p.id, status: "published" })}>
                    <Globe className="mr-1 h-3.5 w-3.5" /> Нийтлэх
                  </Button>
                ) : (
                  <Button size="sm" variant="outline"
                    onClick={() => toggleStatus.mutate({ id: p.id, status: "draft" })}>
                    Ноорог болгох
                  </Button>
                )}
                {p.status === "published" && (
                  <Link to="/blog/$slug" params={{ slug: p.slug }}>
                    <Button size="icon" variant="ghost"><Eye className="h-4 w-4" /></Button>
                  </Link>
                )}
                <Link to="/admin/blog/$id" params={{ id: p.id }}>
                  <Button size="icon" variant="ghost"><Pencil className="h-4 w-4" /></Button>
                </Link>
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button size="icon" variant="ghost"><Trash2 className="h-4 w-4 text-destructive" /></Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>"{p.title}" устгах уу?</AlertDialogTitle>
                      <AlertDialogDescription>Энэ үйлдлийг буцаах боломжгүй.</AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Болих</AlertDialogCancel>
                      <AlertDialogAction onClick={() => del.mutate(p.id)}>Устгах</AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
            </div>
          </Card>
        ))}
        {!postsQ.isLoading && filtered.length === 0 && (
          <div className="rounded-2xl border border-dashed py-16 text-center text-muted-foreground">
            <FileText className="mx-auto mb-3 h-10 w-10 opacity-30" />
            <p>Нийтлэл алга байна</p>
            <Link to="/admin/blog/new">
              <Button variant="outline" className="mt-4"><Plus className="mr-2 h-4 w-4" /> Анхны нийтлэл бичих</Button>
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
