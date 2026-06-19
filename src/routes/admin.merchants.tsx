import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader,
  AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { fmtMnt } from "@/lib/format";
import { toast } from "sonner";
import { Check, X, Search, UserPlus, Pencil, ExternalLink, Globe2 } from "lucide-react";
import { createMerchantAdminUser, assignMerchantAdminByUserId, listAuthUsersLite } from "@/lib/admin-merchant.functions";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import { FOREIGN_SOURCES } from "@/lib/foreign-orders/sources";
import type { Database } from "@/integrations/supabase/types";
type ForeignSource = Database["public"]["Enums"]["foreign_source"];

export const Route = createFileRoute("/admin/merchants")({ component: AdminMerchantsPage });

function AdminMerchantsPage() {
  const { isPlatformAdmin, user } = useAuth();
  const qc = useQueryClient();
  const [tab, setTab] = useState<"all" | "pending" | "approved" | "rejected">("pending");
  const [search, setSearch] = useState("");
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState("");

  const [assignModal, setAssignModal] = useState<{ merchantId: string; merchantName: string } | null>(null);
  const [newAdminEmail, setNewAdminEmail] = useState("");
  const [newAdminPassword, setNewAdminPassword] = useState("");

  const createAdminFn = useServerFn(createMerchantAdminUser);

  const { data: merchants = [], isLoading } = useQuery({
    queryKey: ["admin-merchants-full"],
    enabled: isPlatformAdmin,
    queryFn: async () => {
      const { data } = await supabase
        .from("merchants")
        .select("id,name,slug,logo_url,description,commission_rate,is_active,approval_status,rejection_reason,contact_name,contact_phone,business_type,register_number,can_create_foreign_order_products,allowed_foreign_sources,created_at")
        .order("created_at", { ascending: false });
      return data ?? [];
    },
  });

  const { data: txs = [] } = useQuery({
    queryKey: ["admin-tx-all"],
    enabled: isPlatformAdmin,
    queryFn: async () => {
      const { data } = await supabase
        .from("platform_transactions")
        .select("merchant_id,order_total,commission_amount,commission_rate");
      return data ?? [];
    },
  });

  const statsByMerchant = (txs as any[]).reduce((acc: any, t: any) => {
    const e = (acc[t.merchant_id] ??= { gmv: 0, commission: 0, count: 0 });
    e.gmv += Number(t.order_total); e.commission += Number(t.commission_amount); e.count += 1;
    return acc;
  }, {} as Record<string, { gmv: number; commission: number; count: number }>);

  const updateMerchant = useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: any }) => {
      const { error } = await supabase.from("merchants").update(patch).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Шинэчиллээ"); qc.invalidateQueries({ queryKey: ["admin-merchants-full"] }); },
    onError: (e: any) => toast.error(e.message),
  });

  const approveMerchant = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("merchants").update({
        approval_status: "approved", is_active: true,
        approved_at: new Date().toISOString(), approved_by: user?.id,
      } as any).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("✓ Баталгаажлаа");
      qc.invalidateQueries({ queryKey: ["admin-merchants-full"] });
      qc.invalidateQueries({ queryKey: ["admin-pending-count"] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const rejectMerchant = useMutation({
    mutationFn: async ({ id, reason }: { id: string; reason: string }) => {
      const { error } = await supabase.from("merchants").update({
        approval_status: "rejected", is_active: false, rejection_reason: reason,
      } as any).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Татгалзлаа");
      setRejectingId(null); setRejectReason("");
      qc.invalidateQueries({ queryKey: ["admin-merchants-full"] });
      qc.invalidateQueries({ queryKey: ["admin-pending-count"] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const assignMutation = useMutation({
    mutationFn: async () => {
      if (!assignModal) throw new Error("Modal not open");
      return createAdminFn({ data: { merchantId: assignModal.merchantId, email: newAdminEmail, password: newAdminPassword } });
    },
    onSuccess: () => {
      toast.success(`${newAdminEmail} → "${assignModal?.merchantName}" Admin болгогдлоо`);
      setAssignModal(null); setNewAdminEmail(""); setNewAdminPassword("");
    },
    onError: (e: any) => toast.error(e?.message ?? "Алдаа"),
  });

  const filtered = (merchants as any[])
    .filter((m) => tab === "all" || m.approval_status === tab)
    .filter((m) => !search || m.name.toLowerCase().includes(search.toLowerCase()) || (m.slug ?? "").includes(search.toLowerCase()));

  const pendingCount = (merchants as any[]).filter((m) => m.approval_status === "pending").length;

  return (
    <div className="space-y-6 p-6 md:p-8">
      <div>
        <h1 className="text-2xl font-bold">Мерчантууд</h1>
        <p className="mt-1 text-sm text-muted-foreground">Нийт {merchants.length} дэлгүүр</p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Tabs value={tab} onValueChange={(v: any) => setTab(v)}>
          <TabsList>
            <TabsTrigger value="pending">
              Хүлээгдэж буй
              {pendingCount > 0 && <span className="ml-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-amber-500 text-[10px] font-bold text-white">{pendingCount}</span>}
            </TabsTrigger>
            <TabsTrigger value="approved">Идэвхтэй</TabsTrigger>
            <TabsTrigger value="rejected">Татгалзсан</TabsTrigger>
            <TabsTrigger value="all">Бүгд</TabsTrigger>
          </TabsList>
        </Tabs>
        <div className="relative ml-auto">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input placeholder="Нэр, slug хайх..." className="w-64 pl-9" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
      </div>

      <div className="space-y-3">
        {isLoading && <p className="text-muted-foreground">Уншиж байна...</p>}
        {filtered.map((m: any) => {
          const stat = statsByMerchant[m.id] ?? { gmv: 0, commission: 0, count: 0 };
          return (
            <Card key={m.id} className="rounded-2xl p-4">
              <div className="flex flex-wrap items-start gap-4">
                <div className="flex min-w-0 flex-1 items-center gap-3">
                  {m.logo_url ? (
                    <img src={m.logo_url} className="h-12 w-12 shrink-0 rounded-xl object-cover" alt={m.name} />
                  ) : (
                    <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-muted text-xl font-bold">{m.name[0]}</div>
                  )}
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold">{m.name}</span>
                      <span className="text-xs text-muted-foreground">/{m.slug}</span>
                      <Badge variant={m.approval_status === "approved" ? "default" : m.approval_status === "pending" ? "secondary" : "destructive"} className="text-[10px]">
                        {m.approval_status === "approved" ? "Идэвхтэй" : m.approval_status === "pending" ? "Хүлээгдэж буй" : "Татгалзсан"}
                      </Badge>
                    </div>
                    <div className="mt-0.5 flex flex-wrap gap-3 text-xs text-muted-foreground">
                      {m.contact_name && <span>👤 {m.contact_name}</span>}
                      {m.contact_phone && <span>📞 {m.contact_phone}</span>}
                      {m.business_type && <span>🏢 {m.business_type}</span>}
                      {m.register_number && <span>РД: {m.register_number}</span>}
                    </div>
                  </div>
                </div>

                <div className="flex gap-4 text-sm">
                  <div className="text-center"><div className="text-xs text-muted-foreground">GMV</div><div className="font-semibold">{fmtMnt(stat.gmv)}</div></div>
                  <div className="text-center"><div className="text-xs text-muted-foreground">Шимтгэл</div><div className="font-semibold text-emerald-600">{fmtMnt(stat.commission)}</div></div>
                  <div className="text-center"><div className="text-xs text-muted-foreground">Захиалга</div><div className="font-semibold">{stat.count}</div></div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <CommissionRateEdit value={Number(m.commission_rate)} onSave={(v) => updateMerchant.mutate({ id: m.id, patch: { commission_rate: v } })} />

                  {m.approval_status === "approved" && (
                    <div className="flex items-center gap-1.5 text-xs">
                      <Switch checked={m.is_active} onCheckedChange={(v) => updateMerchant.mutate({ id: m.id, patch: { is_active: v } })} />
                      <span className="text-muted-foreground">{m.is_active ? "Нээлттэй" : "Хаалттай"}</span>
                    </div>
                  )}

                  {m.approval_status === "pending" && (
                    <>
                      <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700" onClick={() => approveMerchant.mutate(m.id)} disabled={approveMerchant.isPending}>
                        <Check className="mr-1 h-3.5 w-3.5" /> Баталгаажуулах
                      </Button>
                      <AlertDialog open={rejectingId === m.id} onOpenChange={(o) => { if (!o) { setRejectingId(null); setRejectReason(""); } }}>
                        <AlertDialogTrigger asChild>
                          <Button size="sm" variant="outline" onClick={() => setRejectingId(m.id)}>
                            <X className="mr-1 h-3.5 w-3.5" /> Татгалзах
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>"{m.name}" татгалзах уу?</AlertDialogTitle>
                            <AlertDialogDescription>Татгалзах шалтгааныг бичнэ үү.</AlertDialogDescription>
                          </AlertDialogHeader>
                          <Input value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} placeholder="Шалтгаан..." className="mt-2" />
                          <AlertDialogFooter>
                            <AlertDialogCancel>Болих</AlertDialogCancel>
                            <AlertDialogAction onClick={() => rejectMerchant.mutate({ id: m.id, reason: rejectReason || "Татгалзсан" })}>Татгалзах</AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </>
                  )}

                  <ForeignPermissionEditor
                    merchant={m}
                    onSave={(patch) => updateMerchant.mutate({ id: m.id, patch })}
                    pending={updateMerchant.isPending}
                  />

                  <Button size="sm" variant="outline" onClick={() => { setAssignModal({ merchantId: m.id, merchantName: m.name }); setNewAdminEmail(""); setNewAdminPassword(""); }}>
                    <UserPlus className="mr-1 h-3.5 w-3.5" /> Admin томилох
                  </Button>

                  <Link to="/store/$merchantSlug" params={{ merchantSlug: m.slug }}>
                    <Button size="sm" variant="ghost"><ExternalLink className="h-3.5 w-3.5" /></Button>
                  </Link>
                </div>
              </div>

              {m.approval_status === "rejected" && m.rejection_reason && (
                <div className="mt-3 rounded-lg bg-destructive/10 px-3 py-2 text-xs text-destructive">
                  Татгалзсан шалтгаан: {m.rejection_reason}
                </div>
              )}
            </Card>
          );
        })}
        {!isLoading && filtered.length === 0 && (
          <div className="rounded-2xl border border-dashed py-16 text-center text-muted-foreground">Мерчант олдсонгүй</div>
        )}
      </div>

      {assignModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <Card className="w-full max-w-md rounded-2xl p-6">
            <h3 className="text-lg font-semibold">Admin хэрэглэгч томилох</h3>
            <p className="mt-1 text-sm text-muted-foreground">"{assignModal.merchantName}" дэлгүүрт шинэ admin хэрэглэгч үүсгэж томилно.</p>
            <div className="mt-4 space-y-3">
              <div>
                <label className="text-sm font-medium">Имэйл *</label>
                <Input type="email" value={newAdminEmail} onChange={(e) => setNewAdminEmail(e.target.value)} placeholder="admin@example.com" className="mt-1" />
              </div>
              <div>
                <label className="text-sm font-medium">Нууц үг * (хэрэглэгч дараа өөрчилнө)</label>
                <Input type="password" value={newAdminPassword} onChange={(e) => setNewAdminPassword(e.target.value)} placeholder="Хамгийн багадаа 6 тэмдэгт" className="mt-1" />
              </div>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <Button variant="outline" onClick={() => setAssignModal(null)}>Болих</Button>
              <Button onClick={() => assignMutation.mutate()} disabled={assignMutation.isPending || !newAdminEmail || newAdminPassword.length < 6}>
                {assignMutation.isPending ? "Үүсгэж байна..." : "Томилох"}
              </Button>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}

function CommissionRateEdit({ value, onSave }: { value: number; onSave: (v: number) => void }) {
  const [editing, setEditing] = useState(false);
  const [rate, setRate] = useState(String(value));
  const save = () => {
    const v = Number(rate);
    if (isNaN(v) || v < 0 || v > 100) return toast.error("0-100 хооронд");
    onSave(v); setEditing(false);
  };
  if (editing) return (
    <div className="flex items-center gap-1">
      <Input className="h-8 w-20" type="number" step="0.1" min="0" max="100" value={rate} onChange={(e) => setRate(e.target.value)} onKeyDown={(e) => e.key === "Enter" && save()} />
      <Button size="icon" variant="ghost" className="h-8 w-8" onClick={save}><Check className="h-3.5 w-3.5 text-emerald-600" /></Button>
      <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => { setEditing(false); setRate(String(value)); }}><X className="h-3.5 w-3.5" /></Button>
    </div>
  );
  return (
    <button onClick={() => setEditing(true)} className="flex items-center gap-1 rounded-lg border border-border px-2.5 py-1 text-sm hover:bg-muted">
      <Pencil className="h-3 w-3 text-muted-foreground" /> {value}%
    </button>
  );
}

function ForeignPermissionEditor({
  merchant,
  onSave,
  pending,
}: {
  merchant: any;
  onSave: (patch: { can_create_foreign_order_products: boolean; allowed_foreign_sources: ForeignSource[] }) => void;
  pending: boolean;
}) {
  const initialCan = !!merchant.can_create_foreign_order_products;
  const initialSources: ForeignSource[] = (merchant.allowed_foreign_sources as ForeignSource[] | null) ?? [];
  const [open, setOpen] = useState(false);
  const [can, setCan] = useState(initialCan);
  const [sources, setSources] = useState<ForeignSource[]>(initialSources);

  // Re-sync when popover opens or merchant row changes
  function onOpenChange(o: boolean) {
    if (o) {
      setCan(initialCan);
      setSources(initialSources);
    }
    setOpen(o);
  }

  const toggleSource = (key: ForeignSource) =>
    setSources((prev) => (prev.includes(key) ? prev.filter((s) => s !== key) : [...prev, key]));

  const count = initialSources.length;
  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>
        <Button
          size="sm"
          variant={initialCan ? "default" : "outline"}
          className={initialCan ? "bg-indigo-600 hover:bg-indigo-700" : ""}
        >
          <Globe2 className="mr-1 h-3.5 w-3.5" />
          Гадаад захиалга
          {initialCan && <span className="ml-1.5 rounded-full bg-white/20 px-1.5 text-[10px]">{count}</span>}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-4">
        <div className="space-y-3">
          <div>
            <div className="text-sm font-semibold">Гадаадаас захиалах эрх</div>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Энэ дэлгүүр гадны эх сурвалжаас бараа импортлох эсэх, ямар эх сурвалж зөвшөөрөгдсөн зэргийг тохируулна.
            </p>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <Switch checked={can} onCheckedChange={setCan} />
            <span>Гадаад захиалгын бараа нэмэхийг зөвшөөрөх</span>
          </label>
          <div className={`space-y-2 rounded-lg border p-2 ${can ? "" : "opacity-50"}`}>
            <div className="text-xs font-medium text-muted-foreground">Зөвшөөрөгдсөн эх сурвалжууд</div>
            {Object.values(FOREIGN_SOURCES).map((s) => (
              <label key={s.key} className="flex items-start gap-2 text-sm">
                <Checkbox
                  checked={sources.includes(s.key)}
                  disabled={!can || !s.active}
                  onCheckedChange={() => toggleSource(s.key)}
                />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span className="font-medium">{s.name}</span>
                    {!s.active && (
                      <Badge variant="outline" className="text-[9px]">удахгүй</Badge>
                    )}
                  </div>
                  <div className="text-[11px] text-muted-foreground">
                    {s.country} · {s.currency} · {s.defaultDeliveryMinDays}-{s.defaultDeliveryMaxDays} өдөр
                  </div>
                </div>
              </label>
            ))}
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>Болих</Button>
            <Button
              size="sm"
              disabled={pending}
              onClick={() => {
                onSave({
                  can_create_foreign_order_products: can,
                  allowed_foreign_sources: can ? sources : [],
                });
                setOpen(false);
              }}
            >
              Хадгалах
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
