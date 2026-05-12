import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { toast } from "sonner";

export const Route = createFileRoute("/merchant/login")({
  component: LoginPage,
});

function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const { user, primaryMerchantId, isPlatformAdmin, refreshRoles } = useAuth();

  useEffect(() => {
    if (user) refreshRoles();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  useEffect(() => {
    if (!user) return;
    if (primaryMerchantId) navigate({ to: "/merchant/dashboard" });
    else if (isPlatformAdmin) navigate({ to: "/admin" });
  }, [user, primaryMerchantId, isPlatformAdmin, navigate]);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (error) return toast.error(error.message);
    toast.success("Амжилттай нэвтэрлээ");
    // Redirect handled by useEffect once roles load
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <Card className="w-full max-w-md rounded-2xl p-8">
        <Link to="/" className="mb-6 block text-center text-2xl font-bold">Only</Link>
        <h1 className="text-center text-2xl font-semibold">Мерчант нэвтрэх</h1>
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
          Бүртгэлгүй юу? <Link to="/merchant/register" className="text-primary hover:underline">Дэлгүүр нээх</Link>
        </p>
      </Card>
    </div>
  );
}
