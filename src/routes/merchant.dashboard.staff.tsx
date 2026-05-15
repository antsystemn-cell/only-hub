import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useAuth } from "@/hooks/use-auth";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Trash2, UserPlus, Search } from "lucide-react";
import {
  findUserByEmail, listMerchantStaff, assignStaffRole, removeStaffRole,
} from "@/lib/staff.functions";

export const Route = createFileRoute("/merchant/dashboard/staff")({ component: StaffPage });

const ROLE_LABELS: Record<string, string> = {
  merchant_owner: "Эзэмшигч",
  merchant_admin: "Админ",
  merchant_moderator: "Модератор",
  merchant_driver: "Жолооч",
};

function StaffPage() {
  const { primaryMerchantId } = useAuth();
  const qc = useQueryClient();
  const list = useServerFn(listMerchantStaff);
  const find = useServerFn(findUserByEmail);
  const assign = useServerFn(assignStaffRole);
  const remove = useServerFn(removeStaffRole);

  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"merchant_admin" | "merchant_moderator" | "merchant_driver">("merchant_admin");
  const [foundUser, setFoundUser] = useState<{ userId: string; email: string } | null>(null);

  const staffQ = useQuery({
    queryKey: ["merchant-staff", primaryMerchantId],
    enabled: !!primaryMerchantId,
    queryFn: () => list({ data: { merchantId: primaryMerchantId! } }),
  });

  const findM = useMutation({
    mutationFn: () => find({ data: { email: email.trim(), merchantId: primaryMerchantId! } }),
    onSuccess: (res) => {
      if (!res.found) {
        setFoundUser(null);
        toast.error("Энэ имэйлээр бүртгэлтэй хэрэглэгч олдсонгүй. Хэрэглэгч эхлээд /register хуудсаар бүртгүүлэх ёстой.");
      } else {
        setFoundUser({ userId: res.userId, email: res.email });
        toast.success("Хэрэглэгч олдлоо");
      }
    },
    onError: (e: any) => toast.error(e?.message ?? "Алдаа"),
  });

  const assignM = useMutation({
    mutationFn: () => assign({ data: { merchantId: primaryMerchantId!, userId: foundUser!.userId, role } }),
    onSuccess: () => {
      toast.success("Эрх амжилттай олголоо");
      setEmail(""); setFoundUser(null);
      qc.invalidateQueries({ queryKey: ["merchant-staff", primaryMerchantId] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Алдаа"),
  });

  const removeM = useMutation({
    mutationFn: (roleRowId: string) => remove({ data: { merchantId: primaryMerchantId!, roleRowId } }),
    onSuccess: () => {
      toast.success("Эрх хасагдлаа");
      qc.invalidateQueries({ queryKey: ["merchant-staff", primaryMerchantId] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Алдаа"),
  });

  const staff = staffQ.data ?? [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Ажилтан / Эрх</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Бүртгэлтэй хэрэглэгчийг и-мэйлээр нь хайж, дэлгүүрийн админ эрх олгоно.
        </p>
      </div>

      <Card className="rounded-2xl p-6">
        <h2 className="font-semibold">Шинэ ажилтан нэмэх</h2>
        <div className="mt-4 grid gap-3 md:grid-cols-[1fr,auto]">
          <div>
            <Label>Хэрэглэгчийн и-мэйл</Label>
            <div className="mt-1 flex gap-2">
              <Input
                type="email"
                value={email}
                onChange={(e) => { setEmail(e.target.value); setFoundUser(null); }}
                placeholder="user@example.com"
              />
              <Button
                type="button"
                variant="outline"
                onClick={() => findM.mutate()}
                disabled={!email || findM.isPending}
              >
                <Search className="mr-2 h-4 w-4" /> Хайх
              </Button>
            </div>
          </div>
        </div>

        {foundUser && (
          <div className="mt-4 rounded-xl border border-border p-4">
            <p className="text-sm">Олдсон хэрэглэгч: <span className="font-semibold">{foundUser.email}</span></p>
            <div className="mt-3 flex flex-wrap items-end gap-3">
              <div className="min-w-[180px]">
                <Label>Эрх</Label>
                <Select value={role} onValueChange={(v) => setRole(v as any)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="merchant_admin">Админ</SelectItem>
                    <SelectItem value="merchant_moderator">Модератор</SelectItem>
                    <SelectItem value="merchant_driver">Жолооч</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <Button onClick={() => assignM.mutate()} disabled={assignM.isPending}>
                <UserPlus className="mr-2 h-4 w-4" /> Эрх олгох
              </Button>
            </div>
          </div>
        )}
      </Card>

      <Card className="rounded-2xl p-6">
        <h2 className="font-semibold">Одоогийн ажилтнууд</h2>
        {staffQ.isLoading ? (
          <p className="mt-4 text-sm text-muted-foreground">Уншиж байна...</p>
        ) : staff.length === 0 ? (
          <p className="mt-4 text-sm text-muted-foreground">Ажилтан алга байна.</p>
        ) : (
          <div className="mt-4 space-y-2">
            {staff.map((s) => (
              <div key={s.id} className="flex items-center justify-between gap-3 rounded-xl border border-border p-3">
                <div className="min-w-0">
                  <div className="truncate font-medium">{s.email || s.user_id.slice(0, 8) + "…"}</div>
                  <div className="mt-0.5 flex items-center gap-2">
                    <Badge variant={s.role === "merchant_owner" ? "default" : "secondary"}>
                      {ROLE_LABELS[s.role] ?? s.role}
                    </Badge>
                  </div>
                </div>
                {s.role !== "merchant_owner" && (
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => {
                      if (confirm("Энэ эрхийг хасах уу?")) removeM.mutate(s.id);
                    }}
                  >
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                )}
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
