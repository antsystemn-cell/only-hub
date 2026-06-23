import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/merchant/dashboard/foreign-queue")({
  beforeLoad: () => {
    throw redirect({ to: "/merchant/dashboard/orders" });
  },
});
