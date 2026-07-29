import { createFileRoute } from "@tanstack/react-router";
import ProductsPage from "./merchant.dashboard.products";

export const Route = createFileRoute("/merchant/dashboard/products/")({
  component: ProductsPage,
});
