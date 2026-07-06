import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";

export default defineTool({
  name: "list_stores",
  title: "List stores",
  description: "List active, approved merchant stores on only.mn.",
  inputSchema: {
    query: z.string().trim().optional().describe("Optional search text matched against store name or slug."),
    limit: z.number().int().min(1).max(100).optional().describe("Max results (default 25)."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ query, limit }) => {
    const { createClient } = await import("@supabase/supabase-js");
    const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_PUBLISHABLE_KEY!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    let q = supabase
      .from("merchants")
      .select("id, name, slug, logo_url, description, followers_count")
      .eq("is_active", true)
      .eq("approval_status", "approved")
      .order("followers_count", { ascending: false })
      .limit(limit ?? 25);
    if (query && query.length > 0) {
      const pat = `%${query.replace(/[%_]/g, (m) => "\\" + m)}%`;
      q = q.or(`name.ilike.${pat},slug.ilike.${pat}`);
    }
    const { data, error } = await q;
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    return {
      content: [{ type: "text", text: JSON.stringify(data ?? [], null, 2) }],
      structuredContent: { stores: data ?? [] },
    };
  },
});
