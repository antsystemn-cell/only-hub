import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { toast } from "sonner";
import { TokiSignInButton } from "@/components/auth/TokiSignInButton";


export const Route = createFileRoute("/register")({
  head: () => ({
    meta: [
      { title: "Бүртгүүлэх — Only" },
      { name: "description", content: "Only платформд бүртгүүлж худалдан авалт хий." },
    ],
  }),
  component: RegisterPage,
});

function RegisterPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [loading, setLoading] = useState(false);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 6) return toast.error("Нууц үг 6+ тэмдэгт");
    setLoading(true);
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: `${window.location.origin}/`,
        data: { full_name: name, phone },
      },
    });
    if (error) {
      setLoading(false);
      return toast.error(error.message);
    }
    // Try immediate sign-in (works if auto-confirm is on)
    const { error: signInErr } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (signInErr) {
      toast.success("Бүртгэл амжилттай. И-мэйлээ шалгаж баталгаажуулна уу.");
      return;
    }
    toast.success("Амжилттай бүртгэгдлээ");
    window.location.href = "/";
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 py-10">
      <Card className="w-full max-w-md rounded-2xl p-8">
        <Link to="/" className="mb-6 block text-center text-2xl font-bold">Only</Link>
        <h1 className="text-center text-2xl font-semibold">Бүртгүүлэх</h1>
        <p className="mt-1 text-center text-sm text-muted-foreground">Хэрэглэгчийн шинэ бүртгэл үүсгэх</p>
        <form onSubmit={onSubmit} className="mt-6 space-y-4">
          <div>
            <Label>Нэр</Label>
            <Input required value={name} onChange={(e) => setName(e.target.value)} placeholder="Овог Нэр" />
          </div>
          <div>
            <Label>Утас</Label>
            <Input required type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="99XXXXXX" />
          </div>
          <div>
            <Label>И-мэйл</Label>
            <Input required type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div>
            <Label>Нууц үг</Label>
            <Input required type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
          </div>
          <Button type="submit" className="w-full" disabled={loading}>{loading ? "Үүсгэж байна..." : "Бүртгүүлэх"}</Button>
        </form>
        <p className="mt-4 text-center text-sm text-muted-foreground">
          Бүртгэлтэй юу? <Link to="/login" className="text-primary hover:underline">Нэвтрэх</Link>
        </p>
      </Card>
    </div>
  );
}
