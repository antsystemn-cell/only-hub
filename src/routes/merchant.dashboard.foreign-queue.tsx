import { createFileRoute } from "@tanstack/react-router";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ForeignQueueView } from "@/components/dashboard/ForeignQueueView";
import { ForeignSyncView } from "@/components/dashboard/ForeignSyncView";

export const Route = createFileRoute("/merchant/dashboard/foreign-queue")({
  component: ForeignQueuePage,
});

function ForeignQueuePage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Гадаад захиалга</h1>
        <p className="text-sm text-muted-foreground">
          Гадаадаас захиалгын дараалал болон эх сурвалжийн sync.
        </p>
      </div>

      <Tabs defaultValue="queue" className="space-y-4">
        <TabsList>
          <TabsTrigger value="queue">Дараалал</TabsTrigger>
          <TabsTrigger value="sync">Гадаад Sync</TabsTrigger>
        </TabsList>

        <TabsContent value="queue" className="mt-0">
          <ForeignQueueView />
        </TabsContent>

        <TabsContent value="sync" className="mt-0">
          <ForeignSyncView />
        </TabsContent>
      </Tabs>
    </div>
  );
}
