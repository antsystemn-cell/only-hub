import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/merchant/dashboard/foreign-sync")({
  beforeLoad: () => {
    throw redirect({ to: "/merchant/dashboard/products" });
  },
});
