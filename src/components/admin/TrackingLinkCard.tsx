import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Copy, Link2, RefreshCw, Send, XCircle } from "lucide-react";
import {
  getTrackingLinkFn,
  regenerateTrackingTokenFn,
  disableTrackingTokenFn,
  resendTrackingLinkSmsFn,
} from "@/lib/tracking/tracking.functions";

export function TrackingLinkCard({ orderId }: { orderId: string }) {
  const qc = useQueryClient();
  const getFn = useServerFn(getTrackingLinkFn);
  const regenFn = useServerFn(regenerateTrackingTokenFn);
  const disableFn = useServerFn(disableTrackingTokenFn);
  const resendFn = useServerFn(resendTrackingLinkSmsFn);

  const { data, isLoading } = useQuery({
    queryKey: ["tracking-link", orderId],
    queryFn: () => getFn({ data: { orderId } }),
  });

  const regenMut = useMutation({
    mutationFn: () => regenFn({ data: { orderId } }),
    onSuccess: (r: any) => {
      if (r.ok) {
        toast.success("Шинэ холбоос үүсгэлээ");
        qc.invalidateQueries({ queryKey: ["tracking-link", orderId] });
      } else toast.error(r.error);
    },
  });

  const disableMut = useMutation({
    mutationFn: () => disableFn({ data: { orderId } }),
    onSuccess: (r: any) => {
      if (r.ok) {
        toast.success("Холбоос идэвхгүй боллоо");
        qc.invalidateQueries({ queryKey: ["tracking-link", orderId] });
      } else toast.error(r.error);
    },
  });

  const resendMut = useMutation({
    mutationFn: () => resendFn({ data: { orderId } }),
    onSuccess: (r: any) => {
      if (r.ok) toast.success("SMS дахин илгээгдлээ");
      else toast.error(r.error);
    },
  });

  if (isLoading) return null;
  if (!data || !(data as any).ok) return null;
  const d = data as any;

  return (
    <Card className="p-4 space-y-3">
      <div className="flex items-center gap-2">
        <Link2 className="h-4 w-4" />
        <p className="font-semibold">Хяналтын холбоос</p>
      </div>
      <div className="flex items-center gap-2">
        <input
          readOnly
          value={d.url}
          className="flex-1 text-xs bg-muted px-2 py-1.5 rounded border font-mono"
          onFocus={(e) => e.currentTarget.select()}
        />
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            navigator.clipboard.writeText(d.url);
            toast.success("Хуулагдлаа");
          }}
        >
          <Copy className="h-4 w-4" />
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        Хандалт: {d.openCount}
        {d.lastAccessedAt && (
          <> · сүүлд: {new Date(d.lastAccessedAt).toLocaleString("mn-MN")}</>
        )}
      </p>
      <div className="flex flex-wrap gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={() => resendMut.mutate()}
          disabled={resendMut.isPending}
        >
          <Send className="h-3 w-3 mr-1" /> SMS дахин илгээх
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => regenMut.mutate()}
          disabled={regenMut.isPending}
        >
          <RefreshCw className="h-3 w-3 mr-1" /> Шинээр үүсгэх
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => disableMut.mutate()}
          disabled={disableMut.isPending || !d.isActive}
        >
          <XCircle className="h-3 w-3 mr-1" /> Идэвхгүй болгох
        </Button>
      </div>
    </Card>
  );
}
