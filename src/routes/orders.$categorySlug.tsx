import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/orders/$categorySlug")({
  beforeLoad: ({ params }) => {
    throw redirect({
      to: "/store/$merchantSlug",
      params: { merchantSlug: "orders" },
      search: { category: params.categorySlug },
    });
  },
});
