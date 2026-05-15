import { createFileRoute, Link, useNavigate, useSearch } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { toast } from "sonner";

const searchSchema = z.object({ redirect: z.string().optional() });

export const Route = createFileRoute("/login")({
  validateSearch: (s) => searchSchema.parse(s),
  head: () => ({
    meta: [
      { title: "Нэвтрэх — Only" },
      { name: "description", content: "Only платформд нэвтэрч худалдан авалтаа эхэл." },
    ],
  }),
  component: LoginPage,
});

function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const search = useSearch({ from: "/login" });
  const { user } = useAuth();

  useEffect(() => {
    if (user) {
      const to = search.redirect && search.redirect.startsWith("/") ? search.redirect : "/";
      window.location.href = to;
    }
  }, [user, search.redirect]);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (error) return toast.error(error.message);
    toast.success("Амжилттай нэвтэрлээ");
    const to = search.redirect && search.redirect.startsWith("/") ? search.redirect : "/";
    window.location.href = to;
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <Card className="w-full max-w-md rounded-2xl p-8">
        <Link to="/" className="mb-6 block text-center text-2xl font-bold">Only</Link>
        <h1 className="text-center text-2xl font-semibold">Нэвтрэх</h1>
        <p className="mt-1 text-center text-sm text-muted-foreground">Худалдан авалтаа үргэлжлүүл</p>
        <form onSubmit={onSubmit} className="mt-6 space-y-4">
          <div>
            <Label>И-мэйл</Label>
            <Input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div>
            <Label>Нууц үг</Label>
            <Input type="password" required value={password} onChange={(e) => setPassword(e.target.value)} />
          </div>
          <Button type="submit" className="w-full" disabled={loading}>{loading ? "Нэвтэрч байна..." : "Нэвтрэх"}</Button>
        </form>
        <p className="mt-4 text-center text-sm text-muted-foreground">
          Бүртгэлгүй юу? <Link to="/register" className="text-primary hover:underline">Бүртгүүлэх</Link>
        </p>
        <p className="mt-2 text-center text-xs text-muted-foreground">
          Дэлгүүр эзэмшигч үү? <Link to="/merchant/register" className="hover:underline">Дэлгүүр нээх</Link>
        </p>
      </Card>
    </div>
  );
}
