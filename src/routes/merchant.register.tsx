import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { toast } from "sonner";
import { slugify } from "@/lib/format";

export const Route = createFileRoute("/merchant/register")({
  component: RegisterPage,
});

function RegisterPage() {
  const [storeName, setStoreName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const { refreshRoles } = useAuth();

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 6) return toast.error("Нууц үг 6+ тэмдэгт");
    setLoading(true);

    // 1. Create auth user
    const { data: signUp, error: signUpErr } = await supabase.auth.signUp({
      email,
      password,
      options: { emailRedirectTo: window.location.origin + "/merchant/dashboard" },
    });
    if (signUpErr || !signUp.user) {
      setLoading(false);
      return toast.error(signUpErr?.message ?? "Бүртгэл амжилтгүй");
    }

    // Sign-in (handles cases where email confirm is off, gives us a session for RLS)
    await supabase.auth.signInWithPassword({ email, password });

    // 2. Create merchant
    const baseSlug = slugify(storeName) || "store";
    const slug = `${baseSlug}-${Math.random().toString(36).slice(2, 6)}`;
    const { data: merchant, error: mErr } = await supabase
      .from("merchants")
      .insert({ name: storeName, slug, owner_id: signUp.user.id })
      .select()
      .single();
    if (mErr || !merchant) {
      setLoading(false);
      return toast.error("Дэлгүүр үүсгэхэд алдаа: " + (mErr?.message ?? ""));
    }

    // 3. Add user_role + merchant_users
    await supabase.from("user_roles").insert({ user_id: signUp.user.id, role: "merchant_owner", merchant_id: merchant.id });
    await supabase.from("merchant_users").insert({ user_id: signUp.user.id, merchant_id: merchant.id, role: "owner" });

    await refreshRoles();
    setLoading(false);
    toast.success("Дэлгүүр амжилттай үүслээ!");
    navigate({ to: "/merchant/dashboard" });
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 py-10">
      <Card className="w-full max-w-md rounded-2xl p-8">
        <Link to="/" className="mb-6 block text-center text-2xl font-bold">Only</Link>
        <h1 className="text-center text-2xl font-semibold">Дэлгүүр нээх</h1>
        <form onSubmit={onSubmit} className="mt-6 space-y-4">
          <div>
            <Label>Дэлгүүрийн нэр</Label>
            <Input required value={storeName} onChange={(e) => setStoreName(e.target.value)} placeholder="Жишээ дэлгүүр" />
          </div>
          <div>
            <Label>И-мэйл</Label>
            <Input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div>
            <Label>Нууц үг</Label>
            <Input type="password" required value={password} onChange={(e) => setPassword(e.target.value)} />
          </div>
          <Button type="submit" className="w-full" disabled={loading}>{loading ? "Үүсгэж байна..." : "Бүртгүүлэх"}</Button>
        </form>
        <p className="mt-4 text-center text-sm text-muted-foreground">
          Бүртгэлтэй юу? <Link to="/merchant/login" className="text-primary hover:underline">Нэвтрэх</Link>
        </p>
      </Card>
    </div>
  );
}
