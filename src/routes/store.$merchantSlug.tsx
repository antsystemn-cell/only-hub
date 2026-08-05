import { createFileRoute } from "@tanstack/react-router";
import { StoreView } from "@/components/store/StoreView";
import { z } from "zod";

const storeSearchSchema = z.object({
  category: z.string().optional(),
});

export const Route = createFileRoute("/store/$merchantSlug")({
  validateSearch: (search) => storeSearchSchema.parse(search),
  component: StorePage,
});


function StorePage() {
  const { merchantSlug } = Route.useParams();
  const { category } = Route.useSearch();
  return <StoreView merchantSlug={merchantSlug} initialCategory={category} />;
}
