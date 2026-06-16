import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { MessageSquare, Send } from "lucide-react";
import { sendTestSmsFn, listSmsTestLogsFn } from "@/lib/admin-message-test.functions";

export const Route = createFileRoute("/admin/message-test")({
  component: MessageTestPage,
});

function MessageTestPage() {
  const sendFn = useServerFn(sendTestSmsFn);
  const listFn = useServerFn(listSmsTestLogsFn);
  const [phone, setPhone] = useState("");
  const [message, setMessage] = useState(
    "Sain bn uu? Eniig Only Hub-aas test SMS yavuulj baina.",
  );
  const [sending, setSending] = useState(false);

  const { data: logs, refetch } = useQuery({
    queryKey: ["admin-sms-logs"],
    queryFn: () => listFn({ data: {} }),
    refetchInterval: 15_000,
  });

  const submit = async () => {
    if (!phone.trim() || !message.trim()) {
      toast.error("Утас ба зурвас оруулна уу");
      return;
    }
    setSending(true);
    try {
      const res = await sendFn({ data: { phone: phone.trim(), message } });
      if (res.ok) {
        toast.success("SMS амжилттай илгээгдлээ");
      } else {
        toast.error(res.error || "Илгээж чадсангүй");
      }
      refetch();
    } catch (e: any) {
      toast.error(e?.message ?? "Алдаа гарлаа");
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="space-y-6 p-6 md:p-8">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold">
          <MessageSquare className="h-6 w-6" /> Message API Test
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          CallPro SMS API-г шууд туршиж шалгах хэсэг. Бүх илгээлт notifications_log-д хадгалагдана.
        </p>
      </div>

      <Card className="space-y-4 rounded-2xl p-6">
        <div className="space-y-2">
          <label className="text-sm font-medium">Утасны дугаар</label>
          <Input
            placeholder="99112233"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <label className="text-sm font-medium">Зурвасын агуулга</label>
          <Textarea
            rows={5}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            maxLength={800}
          />
          <p className="text-xs text-muted-foreground">{message.length}/800 тэмдэгт</p>
        </div>
        <Button onClick={submit} disabled={sending} className="gap-2">
          <Send className="h-4 w-4" />
          {sending ? "Илгээж байна..." : "Test message илгээх"}
        </Button>
      </Card>

      <Card className="rounded-2xl p-0 overflow-hidden">
        <div className="border-b border-border px-4 py-3">
          <h2 className="text-sm font-semibold">Сүүлийн 50 SMS лог</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-left text-xs text-muted-foreground">
              <tr>
                <th className="px-4 py-2">Огноо</th>
                <th className="px-4 py-2">Утас</th>
                <th className="px-4 py-2">Зурвас</th>
                <th className="px-4 py-2">Төлөв</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {(logs?.items ?? []).map((l: any) => (
                <tr key={l.id}>
                  <td className="px-4 py-2 text-xs text-muted-foreground">
                    {new Date(l.created_at).toLocaleString("mn-MN")}
                  </td>
                  <td className="px-4 py-2 font-mono text-xs">{l.recipient ?? "—"}</td>
                  <td className="px-4 py-2 max-w-md truncate text-xs">{l.message ?? "—"}</td>
                  <td className="px-4 py-2">
                    <Badge
                      variant="outline"
                      className={
                        l.status === "sent"
                          ? "border-emerald-500/40 text-emerald-600"
                          : "border-destructive/40 text-destructive"
                      }
                    >
                      {l.status}
                    </Badge>
                    {l.error && (
                      <div className="mt-1 text-[10px] text-destructive">{l.error}</div>
                    )}
                  </td>
                </tr>
              ))}
              {(!logs || logs.items.length === 0) && (
                <tr>
                  <td colSpan={4} className="py-8 text-center text-muted-foreground">
                    Лог байхгүй
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
