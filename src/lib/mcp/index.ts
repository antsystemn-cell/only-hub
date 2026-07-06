import { defineMcp } from "@lovable.dev/mcp-js";
import searchProducts from "./tools/search-products";
import listStores from "./tools/list-stores";
import getProduct from "./tools/get-product";

export default defineMcp({
  name: "only-mn-mcp",
  title: "only.mn MCP",
  version: "0.1.0",
  instructions:
    "Tools for browsing the only.mn marketplace: search public products, list approved stores, and fetch product details.",
  tools: [searchProducts, listStores, getProduct],
});
