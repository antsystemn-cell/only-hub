import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { Bot, Save } from "lucide-react";

export const Route = createFileRoute("/merchant/dashboard/chatbot")({ component: ChatbotPage });

function ChatbotPage() {
  const { primaryMerchantId } = useAuth();
  const merchantId = primaryMerchantId!;
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["chatbot_settings", merchantId],
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("chatbot_settings")
        .select("*")
        .eq("merchant_id", merchantId)
        .maybeSingle();
      return data ?? null;
    },
  });

  const [form, setForm] = useState({
    bot_name: "Ассистент",
    greeting_message: "Сайн байна уу! Би танд хэрхэн туслах вэ?",
    system_prompt: "",
    knowledge: "",
    is_enabled: false,
  });

  useEffect(() => {
    if (data) setForm({
      bot_name: data.bot_name ?? "Ассистент",
      greeting_message: data.greeting_message ?? "",
      system_prompt: data.system_prompt ?? "",
      knowledge: data.knowledge ?? "",
      is_enabled: !!data.is_enabled,
    });
  }, [data]);

  const save = useMutation({
    mutationFn: async () => {
      const payload = { ...form, merchant_id: merchantId };
      const { error } = await (supabase as any)
        .from("chatbot_settings")
        .upsert(payload, { onConflict: "merchant_id" });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Хадгалагдлаа");
      qc.invalidateQueries({ queryKey: ["chatbot_settings", merchantId] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Bot className="h-7 w-7 text-primary" />
        <div>
          <h1 className="text-3xl font-bold">AI Чатбот</h1>
          <p className="text-sm text-muted-foreground">Дэлгүүрийн ассистентын тохиргоо</p>
        </div>
      </div>

      <Card className="rounded-2xl p-5 space-y-5">
        {isLoading ? (
          <p className="text-muted-foreground">Уншиж байна...</p>
        ) : (
          <>
            <div className="flex items-center justify-between rounded-xl border border-border p-4">
              <div>
                <div className="font-semibold">Чатбот идэвхжүүлэх</div>
                <div className="text-xs text-muted-foreground">Дэлгүүрт чат цонх харагдана</div>
              </div>
              <Switch checked={form.is_enabled} onCheckedChange={(v) => setForm({ ...form, is_enabled: v })} />
            </div>

            <div>
              <Label>Ботын нэр</Label>
              <Input value={form.bot_name} onChange={(e) => setForm({ ...form, bot_name: e.target.value })} />
            </div>

            <div>
              <Label>Мэндлэх мессеж</Label>
              <Textarea rows={2} value={form.greeting_message} onChange={(e) => setForm({ ...form, greeting_message: e.target.value })} />
            </div>

            <div>
              <Label>Системийн заавар (system prompt)</Label>
              <Textarea
                rows={4}
                placeholder="Та ийм маягаар хариулна... (хэлбэр, дүрэм, лавлагаа)"
                value={form.system_prompt}
                onChange={(e) => setForm({ ...form, system_prompt: e.target.value })}
              />
            </div>

            <div>
              <Label>Мэдлэгийн сан</Label>
              <Textarea
                rows={6}
                placeholder="Дэлгүүрийн талаар мэдээлэл, FAQ, хүргэлтийн нөхцөл г.м"
                value={form.knowledge}
                onChange={(e) => setForm({ ...form, knowledge: e.target.value })}
              />
              <p className="mt-1 text-xs text-muted-foreground">Чатбот хариулахдаа эдгээр мэдээллийг ашиглана.</p>
            </div>

            <div className="flex justify-end">
              <Button onClick={() => save.mutate()} disabled={save.isPending}>
                <Save className="mr-2 h-4 w-4" /> Хадгалах
              </Button>
            </div>

            <div className="rounded-xl bg-amber-500/10 p-3 text-xs text-amber-700">
              ⚠️ Удахгүй: Чат харилцан үйлчлэлийн runtime энд нэмэгдэнэ.
            </div>
          </>
        )}
      </Card>
    </div>
  );
}
