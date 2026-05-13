import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Bot, Save, Send } from "lucide-react";
import { chatbotPreview } from "@/lib/chatbot.functions";

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

          </>
        )}
      </Card>

      <ChatPreview merchantId={merchantId} greeting={form.greeting_message} />
    </div>
  );
}

function ChatPreview({ merchantId, greeting }: { merchantId: string; greeting: string }) {
  const send = useServerFn(chatbotPreview);
  const [messages, setMessages] = useState<Array<{ role: "user" | "assistant"; content: string }>>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);

  const onSend = async () => {
    if (!input.trim() || loading) return;
    const userMsg = input.trim();
    setInput("");
    const next = [...messages, { role: "user" as const, content: userMsg }];
    setMessages(next);
    setLoading(true);
    try {
      const res = await send({ data: { merchantId, messages: next } });
      if (res.ok) setMessages([...next, { role: "assistant", content: res.reply }]);
      else toast.error(res.message);
    } catch (e: any) {
      toast.error(e?.message ?? "Алдаа");
    } finally { setLoading(false); }
  };

  return (
    <Card className="rounded-2xl p-5">
      <h3 className="mb-4 flex items-center gap-2 font-semibold">
        💬 Чатын урьдчилан харах <Badge variant="secondary">Preview</Badge>
      </h3>
      <div className="mb-3 h-64 space-y-3 overflow-y-auto rounded-xl bg-muted/40 p-3">
        {messages.length === 0 && (
          <p className="pt-10 text-center text-sm text-muted-foreground">{greeting}</p>
        )}
        {messages.map((m, i) => (
          <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
            <div className={`max-w-[80%] whitespace-pre-wrap rounded-2xl px-4 py-2 text-sm ${
              m.role === "user" ? "bg-primary text-primary-foreground" : "border border-border bg-card"
            }`}>{m.content}</div>
          </div>
        ))}
        {loading && (
          <div className="flex justify-start">
            <div className="rounded-2xl border border-border bg-card px-4 py-2 text-sm text-muted-foreground">Бичиж байна...</div>
          </div>
        )}
      </div>
      <div className="flex gap-2">
        <Input placeholder="Асуулт бичих..." value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); onSend(); } }}
          disabled={loading} />
        <Button onClick={onSend} disabled={loading || !input.trim()}><Send className="h-4 w-4" /></Button>
      </div>
    </Card>
  );
}
