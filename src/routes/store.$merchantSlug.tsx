import { createFileRoute } from "@tanstack/react-router";
import { StoreView } from "@/components/store/StoreView";

export const Route = createFileRoute("/store/$merchantSlug")({
  validateSearch: (search: Record<string, unknown>) => ({
    category: typeof search.category === "string" ? search.category : undefined,
  }),
  component: StorePage,
});

function StorePage() {
  const { merchantSlug } = Route.useParams();
  const { category } = Route.useSearch();
  return <StoreView merchantSlug={merchantSlug} initialCategory={category} />;
}
