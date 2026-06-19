import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Star, ShieldCheck, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { createReview, myReviewableOrders } from "@/lib/reviews.functions";

type ReviewRow = {
  id: string;
  rating: number;
  comment: string | null;
  images: any;
  created_at: string;
  verified_purchase: boolean;
  user_id: string;
};

export function ReviewsSection({ productId }: { productId: string }) {
  const qc = useQueryClient();
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState("");
  const [orderId, setOrderId] = useState<string>("");

  const myOrdersFn = useServerFn(myReviewableOrders);
  const createFn = useServerFn(createReview);

  const { data: list = [] } = useQuery({
    queryKey: ["pdp-reviews-list", productId],
    queryFn: async () => {
      const { data } = await supabase
        .from("reviews")
        .select("id,rating,comment,images,created_at,verified_purchase,user_id")
        .eq("product_id", productId)
        .eq("is_hidden", false)
        .order("created_at", { ascending: false })
        .limit(50);
      return (data ?? []) as ReviewRow[];
    },
  });

  const { data: eligible } = useQuery({
    queryKey: ["pdp-reviewable", productId, user?.id],
    enabled: !!user?.id && open,
    queryFn: () => myOrdersFn({ data: { productId } }),
  });

  const submit = useMutation({
    mutationFn: async () => {
      if (!orderId) throw new Error("Захиалга сонгоно уу");
      const res: any = await createFn({
        data: { productId, orderId, rating, comment: comment.trim() || null },
      });
      if (!res?.ok) throw new Error(res?.error || "Алдаа");
    },
    onSuccess: () => {
      toast.success("Үнэлгээ илгээгдлээ");
      setOpen(false); setComment(""); setRating(5); setOrderId("");
      qc.invalidateQueries({ queryKey: ["pdp-reviews-list", productId] });
      qc.invalidateQueries({ queryKey: ["pdp-reviews", productId] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Алдаа"),
  });

  const handleOpen = () => {
    if (!user) { toast.error("Үнэлгээ өгөхийн тулд нэвтэрнэ үү"); return; }
    setOpen(true);
  };

  return (
    <Card className="mt-4 rounded-2xl border-border/60 bg-white p-4 sm:p-5">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">Бүх үнэлгээ ({list.length})</h3>
        <Button size="sm" variant="outline" className="h-8 gap-1.5" onClick={handleOpen}>
          <Pencil className="h-3.5 w-3.5" /> Үнэлгээ үлдээх
        </Button>
      </div>

      {list.length === 0 ? (
        <p className="mt-4 text-sm text-muted-foreground">Үнэлгээ хараахан алга.</p>
      ) : (
        <ul className="mt-4 space-y-4">
          {list.map((r) => (
            <li key={r.id} className="border-b border-border/40 pb-3 last:border-0">
              <div className="flex items-center gap-2 text-xs">
                <div className="flex">
                  {[1,2,3,4,5].map(n => (
                    <Star key={n} className={`h-3.5 w-3.5 ${n <= r.rating ? "fill-amber-400 text-amber-400" : "text-muted"}`} />
                  ))}
                </div>
                {r.verified_purchase && (
                  <span className="inline-flex items-center gap-0.5 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-medium text-emerald-700">
                    <ShieldCheck className="h-3 w-3" /> Баталгаажсан худалдан авагч
                  </span>
                )}
                <span className="text-muted-foreground">{new Date(r.created_at).toLocaleDateString("mn-MN")}</span>
              </div>
              {r.comment && <p className="mt-1.5 text-sm text-foreground/90">{r.comment}</p>}
            </li>
          ))}
        </ul>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Үнэлгээ үлдээх</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <div className="mb-1.5 text-xs font-medium text-muted-foreground">Үнэлгээ</div>
              <div className="flex gap-1">
                {[1,2,3,4,5].map(n => (
                  <button key={n} type="button" onClick={() => setRating(n)}>
                    <Star className={`h-7 w-7 transition ${n <= rating ? "fill-amber-400 text-amber-400" : "text-muted-foreground/40"}`} />
                  </button>
                ))}
              </div>
            </div>
            <div>
              <div className="mb-1.5 text-xs font-medium text-muted-foreground">Захиалга сонгох</div>
              {eligible?.ok && eligible.orders.length > 0 ? (
                <select
                  className="h-9 w-full rounded-md border border-border bg-background px-2 text-sm"
                  value={orderId}
                  onChange={(e) => setOrderId(e.target.value)}
                >
                  <option value="">— сонгох —</option>
                  {eligible.orders.map((o: any) => (
                    <option key={o.id} value={o.id}>
                      {new Date(o.created_at).toLocaleDateString("mn-MN")} — {o.id.slice(0,8)}
                    </option>
                  ))}
                </select>
              ) : (
                <p className="rounded-md bg-amber-50 p-2 text-xs text-amber-700">
                  Зөвхөн төлбөр төлөгдсөн, хүргэгдсэн захиалгад үнэлгээ үлдээх боломжтой.
                </p>
              )}
            </div>
            <div>
              <div className="mb-1.5 text-xs font-medium text-muted-foreground">Сэтгэгдэл</div>
              <Textarea rows={4} value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Барааны тухай туршлагаа хуваалцана уу" maxLength={2000} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Болих</Button>
            <Button onClick={() => submit.mutate()} disabled={submit.isPending || !orderId}>
              {submit.isPending ? "Илгээж байна..." : "Илгээх"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
