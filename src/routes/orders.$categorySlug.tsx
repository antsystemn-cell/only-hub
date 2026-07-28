import { createFileRoute } from "@tanstack/react-router";
import { StoreView } from "@/components/store/StoreView";

export const Route = createFileRoute("/orders/$categorySlug")({
  component: OrdersCategoryPage,
});

function OrdersCategoryPage() {
  const { categorySlug } = Route.useParams();
  return <StoreView merchantSlug="orders" initialCategory={categorySlug} forceIndex />;
}
