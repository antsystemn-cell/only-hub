import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader,
  AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, GripVertical, Eye, EyeOff } from "lucide-react";

export const Route = createFileRoute("/admin/banners")({ component: AdminBannersPage });

const EMPTY = {
  title: "", subtitle: "", button_text: "Дэлгэрэнгүй", button_link: "/stores",
  bg_gradient: "from-primary/90 via-primary/70 to-primary/40", banner_image: "",
  is_active: true, position: 0,
};
const GRADIENTS = [
  { label: "Primary", value: "from-primary/90 via-primary/70 to-primary/40" },
  { label: "Emerald", value: "from-emerald-500/90 via-emerald-500/60 to-emerald-500/30" },
  { label: "Violet", value: "from-violet-500/90 via-violet-500/60 to-violet-500/30" },
  { label: "Amber", value: "from-amber-500/90 via-amber-500/60 to-amber-500/30" },
  { label: "Red", value: "from-red-500/90 via-red-500/60 to-red-500/30" },
  { label: "Blue", value: "from-blue-500/90 via-blue-500/60 to-blue-500/30" },
];

function AdminBannersPage() {
  const { isPlatformAdmin } = useAuth();
  const qc = useQueryClient();
  const [form, setForm] = useState<any>(EMPTY);
  const [editId, setEditId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);

  const bannersQ = useQuery({
    queryKey: ["admin-platform-banners"],
    enabled: isPlatformAdmin,
    queryFn: async () => {
      const { data } = await supabase.from("platform_banners").select("*").order("position");
      return data ?? [];
    },
  });

  const save = useMutation({
    mutationFn: async () => {
      const payload = { ...form, position: Number(form.position ?? 0) };
      if (editId) {
        const { error } = await supabase.from("platform_banners").update(payload).eq("id", editId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("platform_banners").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success(editId ? "Шинэчиллээ" : "Нэмэгдлээ");
      qc.invalidateQueries({ queryKey: ["admin-platform-banners"] });
      qc.invalidateQueries({ queryKey: ["platform-banners-home"] });
      setForm(EMPTY); setEditId(null); setShowForm(false);
    },
    onError: (e: any) => toast.error(e.message),
  });

  const del = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("platform_banners").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Устгалаа");
      qc.invalidateQueries({ queryKey: ["admin-platform-banners"] });
      qc.invalidateQueries({ queryKey: ["platform-banners-home"] });
    },
  });

  const toggleActive = useMutation({
    mutationFn: async ({ id, v }: { id: string; v: boolean }) => {
      const { error } = await supabase.from("platform_banners").update({ is_active: v }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-platform-banners"] });
      qc.invalidateQueries({ queryKey: ["platform-banners-home"] });
    },
  });

  const startEdit = (b: any) => {
    setForm({ ...b }); setEditId(b.id); setShowForm(true);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  return (
    <div className="space-y-6 p-6 md:p-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Нүүр хуудасны баннер</h1>
          <p className="mt-1 text-sm text-muted-foreground">Only.mn нүүр хуудасны гулсах баннерууд</p>
        </div>
        <Button onClick={() => { setForm(EMPTY); setEditId(null); setShowForm(true); }}>
          <Plus className="mr-2 h-4 w-4" /> Баннер нэмэх
        </Button>
      </div>

      {showForm && (
        <Card className="rounded-2xl border-primary/30 p-6">
          <h3 className="mb-4 font-semibold">{editId ? "Баннер засах" : "Шинэ баннер"}</h3>

          <div className={`mb-4 overflow-hidden rounded-xl bg-gradient-to-r ${form.bg_gradient} p-6`}>
            <div className="text-white">
              <p className="mb-1 text-xs opacity-70">Урьдчилан харах</p>
              <h3 className="text-xl font-bold">{form.title || "Гарчиг"}</h3>
              {form.subtitle && <p className="mt-1 text-sm opacity-80">{form.subtitle}</p>}
              {form.button_text && <div className="mt-3 inline-block rounded-full bg-white/20 px-4 py-1.5 text-sm backdrop-blur">{form.button_text}</div>}
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="md:col-span-2">
              <Label>Гарчиг *</Label>
              <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Баннерын гарчиг" className="mt-1" />
            </div>
            <div className="md:col-span-2">
              <Label>Дэд гарчиг</Label>
              <Input value={form.subtitle ?? ""} onChange={(e) => setForm({ ...form, subtitle: e.target.value })} placeholder="Нэмэлт тайлбар" className="mt-1" />
            </div>
            <div>
              <Label>Товчлуурын текст</Label>
              <Input value={form.button_text ?? ""} onChange={(e) => setForm({ ...form, button_text: e.target.value })} className="mt-1" />
            </div>
            <div>
              <Label>Товчлуурын линк</Label>
              <Input value={form.button_link ?? ""} onChange={(e) => setForm({ ...form, button_link: e.target.value })} placeholder="/stores" className="mt-1" />
            </div>
            <div className="md:col-span-2">
              <Label>Баннер зурагны URL (заавал биш)</Label>
              <Input value={form.banner_image ?? ""} onChange={(e) => setForm({ ...form, banner_image: e.target.value })} placeholder="https://..." className="mt-1" />
            </div>
            <div className="md:col-span-2">
              <Label>Арын өнгө</Label>
              <div className="mt-2 flex flex-wrap gap-2">
                {GRADIENTS.map((g) => (
                  <button key={g.value} type="button"
                    onClick={() => setForm({ ...form, bg_gradient: g.value })}
                    className={`rounded-lg border-2 bg-gradient-to-r px-3 py-1.5 text-xs font-medium text-white transition-all ${g.value} ${form.bg_gradient === g.value ? "scale-105 border-white" : "border-transparent"}`}>
                    {g.label}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <Label>Дараалал</Label>
              <Input type="number" value={form.position ?? 0} onChange={(e) => setForm({ ...form, position: Number(e.target.value) })} className="mt-1 w-32" />
            </div>
            <div className="flex items-center gap-2 pt-5">
              <Switch checked={form.is_active} onCheckedChange={(v) => setForm({ ...form, is_active: v })} />
              <Label>Идэвхтэй</Label>
            </div>
          </div>

          <div className="mt-5 flex gap-2">
            <Button onClick={() => save.mutate()} disabled={save.isPending || !form.title}>
              {save.isPending ? "Хадгалж байна..." : editId ? "Шинэчлэх" : "Нэмэх"}
            </Button>
            <Button variant="outline" onClick={() => { setShowForm(false); setEditId(null); setForm(EMPTY); }}>Болих</Button>
          </div>
        </Card>
      )}

      <div className="space-y-3">
        {bannersQ.isLoading && <p className="text-muted-foreground">Уншиж байна...</p>}
        {(bannersQ.data ?? []).map((b: any) => (
          <Card key={b.id} className={`rounded-2xl p-4 ${!b.is_active ? "opacity-60" : ""}`}>
            <div className="flex items-center gap-4">
              <GripVertical className="h-5 w-5 shrink-0 cursor-grab text-muted-foreground" />
              <div className={`h-12 w-20 shrink-0 rounded-lg bg-gradient-to-r ${b.bg_gradient}`} />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold">{b.title}</span>
                  {!b.is_active && <span className="rounded bg-muted px-2 py-0.5 text-xs text-muted-foreground">Идэвхгүй</span>}
                </div>
                {b.subtitle && <p className="mt-0.5 truncate text-sm text-muted-foreground">{b.subtitle}</p>}
                <p className="mt-0.5 text-xs text-muted-foreground">→ {b.button_link} · Position: {b.position}</p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <Button size="icon" variant="ghost" onClick={() => toggleActive.mutate({ id: b.id, v: !b.is_active })}>
                  {b.is_active ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4 text-muted-foreground" />}
                </Button>
                <Button size="icon" variant="ghost" onClick={() => startEdit(b)}>
                  <Pencil className="h-4 w-4" />
                </Button>
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button size="icon" variant="ghost"><Trash2 className="h-4 w-4 text-destructive" /></Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>"{b.title}" устгах уу?</AlertDialogTitle>
                      <AlertDialogDescription>Энэ үйлдлийг буцаах боломжгүй.</AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Болих</AlertDialogCancel>
                      <AlertDialogAction onClick={() => del.mutate(b.id)}>Устгах</AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
            </div>
          </Card>
        ))}
        {!bannersQ.isLoading && (bannersQ.data ?? []).length === 0 && (
          <div className="rounded-2xl border border-dashed py-16 text-center text-muted-foreground">
            <p>Баннер алга байна</p>
            <Button variant="outline" className="mt-4" onClick={() => setShowForm(true)}>
              <Plus className="mr-2 h-4 w-4" /> Баннер нэмэх
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
