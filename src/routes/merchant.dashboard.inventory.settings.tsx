import { createFileRoute } from "@tanstack/react-router";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export const Route = createFileRoute("/merchant/dashboard/inventory/settings")({
  component: InventorySettingsPage,
});

function InventorySettingsPage() {
  return (
    <Card className="p-6 space-y-4 max-w-2xl">
      <div>
        <h2 className="font-semibold">Нөөцийн тохиргоо</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Энэ хэсэгт нөөцийн ерөнхий тохиргоо орно. Эхний шатанд тохиргоо хязгаарлагдмал.
        </p>
      </div>
      <div className="space-y-2 text-sm">
        <div className="flex items-center justify-between border-b pb-2">
          <span>Бараатай холбох</span>
          <Badge variant="outline">Дараагийн шатанд</Badge>
        </div>
        <div className="flex items-center justify-between border-b pb-2">
          <span>Агуулахын удирдлага</span>
          <Badge variant="outline">Дараагийн шатанд</Badge>
        </div>
        <div className="flex items-center justify-between">
          <span>Бага үлдэгдлийн сэрэмжлүүлэг</span>
          <Badge variant="outline">Дараагийн шатанд</Badge>
        </div>
      </div>
    </Card>
  );
}
