import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/orders/$categorySlug")({
  beforeLoad: ({ params }) => {
    throw redirect({
      href: `/store/orders?category=${encodeURIComponent(params.categorySlug)}`,
    });
  },
});
