import { createFileRoute } from "@tanstack/react-router";
import { BlogEditor } from "@/components/admin/BlogEditor";

export const Route = createFileRoute("/admin/blog/$id")({ component: BlogEditPage });

function BlogEditPage() {
  const { id } = Route.useParams();
  return <BlogEditor mode="edit" postId={id} />;
}
