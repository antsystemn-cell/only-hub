import { createFileRoute } from "@tanstack/react-router";
import { Card } from "@/components/ui/card";
import { Bot } from "lucide-react";

export const Route = createFileRoute("/merchant/dashboard/chatbot")({ component: () => (
  <div className="space-y-6">
    <h1 className="text-3xl font-bold">AI Чатбот</h1>
    <Card className="rounded-2xl p-10 text-center">
      <Bot className="mx-auto mb-3 h-10 w-10 text-muted-foreground" />
      <p className="text-muted-foreground">Удахгүй: AI чатботын тохиргоо энд гарна.</p>
    </Card>
  </div>
)});
