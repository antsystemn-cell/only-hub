import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";

export default defineTool({
  name: "get_product",
  title: "Get product",
  description: "Get full details for a single product by id or slug.",
  inputSchema: {
    id: z.string().uuid().optional().describe("Product UUID."),
    slug: z.string().trim().optional().describe("Product slug."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ id, slug }) => {
    if (!id && !slug) {
      return { content: [{ type: "text", text: "Provide `id` or `slug`." }], isError: true };
    }
    const { createClient } = await import("@supabase/supabase-js");
    const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_PUBLISHABLE_KEY!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    let q = supabase.from("products").select("*").eq("is_active", true).limit(1);
    if (id) q = q.eq("id", id);
    else if (slug) q = q.eq("slug", slug);
    const { data, error } = await q.maybeSingle();
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    if (!data) return { content: [{ type: "text", text: "Product not found." }], isError: true };
    return {
      content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
      structuredContent: { product: data },
    };
  },
});
