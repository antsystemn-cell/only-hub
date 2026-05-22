import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useAuth } from "@/hooks/use-auth";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Search, Users, ShieldPlus, X, Mail } from "lucide-react";
import { toast } from "sonner";
import { listAllUsers, grantPlatformAdmin, removeUserRole } from "@/lib/admin-users.functions";

export const Route = createFileRoute("/admin/users")({ component: AdminUsersPage });

const ROLE_LABEL: Record<string, string> = {
  platform_admin: "Платформын админ",
  merchant_owner: "Эзэмшигч",
  merchant_admin: "Мерчант админ",
  merchant_moderator: "Модератор",
  merchant_driver: "Жолооч",
};

function AdminUsersPage() {
  const { isPlatformAdmin } = useAuth();
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [grantEmail, setGrantEmail] = useState("");
  const [grantOpen, setGrantOpen] = useState(false);

  const listFn = useServerFn(listAllUsers);
  const grantFn = useServerFn(grantPlatformAdmin);
  const removeFn = useServerFn(removeUserRole);

  const { data, isLoading } = useQuery({
    queryKey: ["admin-all-users"],
    enabled: isPlatformAdmin,
    queryFn: () => listFn(),
  });

  const users = data?.users ?? [];
  const roles = data?.roles ?? [];
  const merchants = data?.merchants ?? [];
  const mName: Record<string, string> = {};
  merchants.forEach((m: any) => { mName[m.id] = m.name; });

  const rolesByUser = new Map<string, any[]>();
  for (const r of roles as any[]) {
    const arr = rolesByUser.get(r.user_id) ?? [];
    arr.push(r);
    rolesByUser.set(r.user_id, arr);
  }

  const q = search.trim().toLowerCase();
  const filtered = users.filter((u: any) =>
    !q || (u.email ?? "").toLowerCase().includes(q) || u.id.includes(q)
  );

  const grant = useMutation({
    mutationFn: () => grantFn({ data: { email: grantEmail.trim() } }),
    onSuccess: () => {
      toast.success("Платформын админ эрх олголоо");
      setGrantEmail("");
      setGrantOpen(false);
      qc.invalidateQueries({ queryKey: ["admin-all-users"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Алдаа"),
  });

  const remove = useMutation({
    mutationFn: (roleId: string) => removeFn({ data: { roleId } }),
    onSuccess: () => {
      toast.success("Эрх хасагдлаа");
      qc.invalidateQueries({ queryKey: ["admin-all-users"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Алдаа"),
  });

  return (
    <div className="space-y-6 p-6 md:p-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Бүртгэлтэй хэрэглэгчид</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Нийт {users.length} хэрэглэгч · Эрхтэй {rolesByUser.size}
          </p>
        </div>
        <div className="flex gap-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input placeholder="Имэйл, ID хайх..." className="w-72 pl-9" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <Dialog open={grantOpen} onOpenChange={setGrantOpen}>
            <DialogTrigger asChild>
              <Button><ShieldPlus className="mr-2 h-4 w-4" /> Админ эрх олгох</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Платформын админ эрх олгох</DialogTitle>
              </DialogHeader>
              <div className="space-y-3">
                <Label>Хэрэглэгчийн имэйл</Label>
                <Input type="email" placeholder="user@example.com" value={grantEmail} onChange={(e) => setGrantEmail(e.target.value)} />
                <p className="text-xs text-muted-foreground">Уг имэйлээр бүртгүүлсэн хэрэглэгчид Платформын админ эрх олгоно.</p>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setGrantOpen(false)}>Болих</Button>
                <Button onClick={() => grant.mutate()} disabled={!grantEmail || grant.isPending}>
                  {grant.isPending ? "Олгож байна..." : "Олгох"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <div className="space-y-3">
        {isLoading && <p className="text-muted-foreground">Уншиж байна...</p>}
        {!isLoading && filtered.length === 0 && (
          <div className="rounded-2xl border border-dashed py-16 text-center text-muted-foreground">
            <Users className="mx-auto mb-3 h-10 w-10 opacity-30" />
            <p>Хэрэглэгч олдсонгүй</p>
          </div>
        )}
        {filtered.map((u: any) => {
          const uRoles = rolesByUser.get(u.id) ?? [];
          return (
            <Card key={u.id} className="rounded-2xl p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <Mail className="h-4 w-4 shrink-0 text-muted-foreground" />
                    <span className="truncate font-medium">{u.email ?? "—"}</span>
                  </div>
                  <div className="mt-1 font-mono text-[10px] text-muted-foreground">{u.id}</div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    Бүртгүүлсэн: {new Date(u.created_at).toLocaleDateString("mn-MN")}
                    {u.last_sign_in_at && ` · Сүүлд нэвтэрсэн: ${new Date(u.last_sign_in_at).toLocaleDateString("mn-MN")}`}
                  </div>
                </div>
              </div>
              {uRoles.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-2">
                  {uRoles.map((r: any) => (
                    <Badge
                      key={r.id}
                      variant={r.role === "platform_admin" ? "default" : "secondary"}
                      className="gap-1 pr-1"
                    >
                      {ROLE_LABEL[r.role] ?? r.role}
                      {r.merchant_id && <span className="opacity-70">· {mName[r.merchant_id] ?? r.merchant_id.slice(0, 6)}</span>}
                      <button
                        onClick={() => {
                          if (confirm(`"${ROLE_LABEL[r.role]}" эрхийг хасах уу?`)) remove.mutate(r.id);
                        }}
                        className="ml-1 rounded p-0.5 hover:bg-background/30"
                        title="Хасах"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </Badge>
                  ))}
                </div>
              )}
            </Card>
          );
        })}
      </div>
    </div>
  );
}
