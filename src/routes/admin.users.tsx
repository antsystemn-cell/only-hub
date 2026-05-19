import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Search, Users } from "lucide-react";

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
  const [search, setSearch] = useState("");

  const { data: roles = [], isLoading } = useQuery({
    queryKey: ["admin-all-roles"],
    enabled: isPlatformAdmin,
    queryFn: async () => {
      const { data } = await supabase
        .from("user_roles")
        .select("id,user_id,role,merchant_id,created_at")
        .order("created_at", { ascending: false });
      return data ?? [];
    },
  });

  const { data: merchants = [] } = useQuery({
    queryKey: ["admin-users-merchants"],
    queryFn: async () => {
      const { data } = await supabase.from("merchants").select("id,name");
      return data ?? [];
    },
  });
  const mName: Record<string, string> = {};
  (merchants as any[]).forEach((m) => { mName[m.id] = m.name; });

  // Group by user_id
  const byUser = new Map<string, any[]>();
  for (const r of roles as any[]) {
    const arr = byUser.get(r.user_id) ?? [];
    arr.push(r);
    byUser.set(r.user_id, arr);
  }
  const users = Array.from(byUser.entries())
    .filter(([uid]) => !search || uid.includes(search.toLowerCase()))
    .map(([uid, rs]) => ({ user_id: uid, roles: rs }));

  return (
    <div className="space-y-6 p-6 md:p-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Бүртгэлтэй хэрэглэгч / Эрх</h1>
          <p className="mt-1 text-sm text-muted-foreground">Эрх олгогдсон бүх хэрэглэгч</p>
        </div>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input placeholder="User ID..." className="w-72 pl-9" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
      </div>

      <div className="space-y-3">
        {isLoading && <p className="text-muted-foreground">Уншиж байна...</p>}
        {!isLoading && users.length === 0 && (
          <div className="rounded-2xl border border-dashed py-16 text-center text-muted-foreground">
            <Users className="mx-auto mb-3 h-10 w-10 opacity-30" />
            <p>Хэрэглэгч олдсонгүй</p>
          </div>
        )}
        {users.map((u) => (
          <Card key={u.user_id} className="rounded-2xl p-4">
            <div className="font-mono text-xs text-muted-foreground">{u.user_id}</div>
            <div className="mt-2 flex flex-wrap gap-2">
              {u.roles.map((r: any) => (
                <Badge key={r.id} variant={r.role === "platform_admin" ? "default" : "secondary"}>
                  {ROLE_LABEL[r.role] ?? r.role}
                  {r.merchant_id && <span className="ml-1 opacity-70">· {mName[r.merchant_id] ?? r.merchant_id.slice(0, 6)}</span>}
                </Badge>
              ))}
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
