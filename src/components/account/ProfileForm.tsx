import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Loader2 } from "lucide-react";

type ProfileRow = {
  id: string;
  full_name: string | null;
  phone: string | null;
  shipping_address: string | null;
  branch: string | null;
};

export function useProfile(userId: string | undefined) {
  return useQuery({
    queryKey: ["profile", userId],
    enabled: !!userId,
    queryFn: async (): Promise<ProfileRow | null> => {
      const { data } = await supabase
        .from("profiles")
        .select("id, full_name, phone, shipping_address, branch")
        .eq("id", userId!)
        .maybeSingle();
      return (data as ProfileRow | null) ?? null;
    },
  });
}

export async function saveProfile(userId: string, values: {
  full_name: string; phone: string; shipping_address: string; branch?: string | null;
}) {
  const { error } = await supabase.from("profiles").upsert({
    id: userId,
    full_name: values.full_name.trim() || null,
    phone: values.phone.trim() || null,
    shipping_address: values.shipping_address.trim() || null,
    branch: values.branch?.trim() || null,
  });
  if (error) throw error;
}

export function ProfileForm({ userId }: { userId: string }) {
  const qc = useQueryClient();
  const { data: profile, isLoading } = useProfile(userId);
  const [form, setForm] = useState({ full_name: "", phone: "", shipping_address: "", branch: "" });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (profile) {
      setForm({
        full_name: profile.full_name ?? "",
        phone: profile.phone ?? "",
        shipping_address: profile.shipping_address ?? "",
        branch: profile.branch ?? "",
      });
    }
  }, [profile]);

  async function onSave() {
    if (!form.full_name.trim()) return toast.error("Нэрээ оруулна уу");
    if (!form.phone.trim()) return toast.error("Утасны дугаараа оруулна уу");
    setSaving(true);
    try {
      await saveProfile(userId, form);
      await qc.invalidateQueries({ queryKey: ["profile", userId] });
      toast.success("Хадгалагдлаа");
    } catch (e: any) {
      toast.error(e?.message ?? "Хадгалахад алдаа");
    } finally {
      setSaving(false);
    }
  }

  if (isLoading) {
    return <div className="text-sm text-muted-foreground">Уншиж байна...</div>;
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <div>
        <Label>Нэр *</Label>
        <Input value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} maxLength={120} />
      </div>
      <div>
        <Label>Утас *</Label>
        <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} maxLength={30} />
      </div>
      <div className="sm:col-span-2">
        <Label>Хүргэх хаяг</Label>
        <Textarea
          value={form.shipping_address}
          onChange={(e) => setForm({ ...form, shipping_address: e.target.value })}
          maxLength={500}
          rows={2}
        />
      </div>
      <div className="sm:col-span-2">
        <Label>Дүүрэг / Хороо (заавал биш)</Label>
        <Input value={form.branch} onChange={(e) => setForm({ ...form, branch: e.target.value })} maxLength={120} />
      </div>
      <div className="sm:col-span-2">
        <Button onClick={onSave} disabled={saving}>
          {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Хадгалах
        </Button>
      </div>
    </div>
  );
}
