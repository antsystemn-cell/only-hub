import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/orders/")({
  beforeLoad: () => {
    throw redirect({ to: "/store/$merchantSlug", params: { merchantSlug: "orders" } });
  },
});
