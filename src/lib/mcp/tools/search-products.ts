import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";

export default defineTool({
  name: "search_products",
  title: "Search products",
  description:
    "Search active products on only.mn by keyword. Matches name, description, and product_code. Returns up to `limit` results.",
  inputSchema: {
    query: z.string().trim().min(1).describe("Search text to match against product name/description/code."),
    limit: z.number().int().min(1).max(50).optional().describe("Max results (default 10)."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ query, limit }) => {
    const { createClient } = await import("@supabase/supabase-js");
    const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_PUBLISHABLE_KEY!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const max = limit ?? 10;
    const pattern = `%${query.replace(/[%_]/g, (m) => "\\" + m)}%`;
    const { data, error } = await supabase
      .from("products")
      .select("id, name, slug, price, original_price, image_url, merchant_id, product_code, brand_id, category")
      .eq("is_active", true)
      .or(`name.ilike.${pattern},description.ilike.${pattern},product_code.ilike.${pattern}`)
      .order("sales", { ascending: false })
      .limit(max);
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    return {
      content: [{ type: "text", text: JSON.stringify(data ?? [], null, 2) }],
      structuredContent: { products: data ?? [] },
    };
  },
});
