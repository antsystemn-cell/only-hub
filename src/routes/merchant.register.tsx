import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { toast } from "sonner";
import { slugify } from "@/lib/format";
import { CheckCircle, Store, ShieldCheck, TrendingUp, Zap } from "lucide-react";

export const Route = createFileRoute("/merchant/register")({ component: RegisterPage });

function RegisterPage() {
  const [step, setStep] = useState<"landing" | "form" | "success">("landing");
  const [storeName, setStoreName] = useState("");
  const [contactName, setContactName] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [businessType, setBusinessType] = useState("");
  const [registerNumber, setRegisterNumber] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 6) return toast.error("Нууц үг 6+ тэмдэгт");
    setLoading(true);

    const { data: signUp, error: signUpErr } = await supabase.auth.signUp({ email, password });
    if (signUpErr || !signUp.user) {
      setLoading(false);
      return toast.error(signUpErr?.message ?? "Бүртгэл амжилтгүй");
    }

    let { data: sessData } = await supabase.auth.getSession();
    if (!sessData.session) {
      await supabase.auth.signInWithPassword({ email, password });
      ({ data: sessData } = await supabase.auth.getSession());
    }
    if (!sessData.session) {
      setLoading(false);
      return toast.error("Session үүсээгүй. Дахин оролдоно уу.");
    }

    const baseSlug = slugify(storeName) || "store";
    const slug = `${baseSlug}-${Math.random().toString(36).slice(2, 6)}`;

    const { data: merchant, error: mErr } = await supabase
      .from("merchants")
      .insert({
        name: storeName,
        slug,
        owner_id: signUp.user.id,
        is_active: false,
        approval_status: "pending",
        contact_name: contactName,
        contact_phone: contactPhone,
        business_type: businessType || null,
        register_number: registerNumber || null,
      } as any)
      .select()
      .single();

    if (mErr || !merchant) {
      setLoading(false);
      return toast.error("Дэлгүүр үүсгэхэд алдаа: " + (mErr?.message ?? ""));
    }

    await supabase.from("user_roles").insert({ user_id: signUp.user.id, role: "merchant_owner", merchant_id: merchant.id });
    await supabase.from("merchant_users").insert({ user_id: signUp.user.id, merchant_id: merchant.id, role: "owner" });

    setLoading(false);
    setStep("success");
  };

  if (step === "success") {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-background px-4 text-center">
        <div className="mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-emerald-500/10">
          <CheckCircle className="h-10 w-10 text-emerald-500" />
        </div>
        <h1 className="text-3xl font-bold">Бүртгэл амжилттай!</h1>
        <p className="mt-4 max-w-md text-muted-foreground">
          Таны дэлгүүрийн бүртгэл хүлээн авагдлаа. Манай баг тантай гэрээ байгуулан баталгаажуулсны дараа таны дэлгүүр идэвхждэг. Ихэвчлэн 1-2 ажлын өдрийн дотор холбогдоно.
        </p>
        <div className="mt-8 flex gap-3">
          <Link to="/merchant/login"><Button variant="outline">Нэвтрэх</Button></Link>
          <Link to="/"><Button>Нүүр хуудас</Button></Link>
        </div>
      </div>
    );
  }

  if (step === "form") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-4 py-10">
        <Card className="w-full max-w-lg rounded-2xl p-8">
          <Link to="/" className="mb-6 block text-center text-2xl font-bold">Only</Link>
          <h1 className="text-center text-2xl font-semibold">Дэлгүүрийн мэдээлэл</h1>
          <p className="mt-1 text-center text-sm text-muted-foreground">Бүртгэлийн дараа манай баг танд холбогдоно</p>
          <form onSubmit={onSubmit} className="mt-6 space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="md:col-span-2">
                <Label>Дэлгүүрийн нэр *</Label>
                <Input required value={storeName} onChange={(e) => setStoreName(e.target.value)} placeholder="Миний дэлгүүр" />
              </div>
              <div>
                <Label>Холбоо барих нэр *</Label>
                <Input required value={contactName} onChange={(e) => setContactName(e.target.value)} placeholder="Овог Нэр" />
              </div>
              <div>
                <Label>Утасны дугаар *</Label>
                <Input required type="tel" value={contactPhone} onChange={(e) => setContactPhone(e.target.value)} placeholder="99XXXXXX" />
              </div>
              <div>
                <Label>Бизнесийн төрөл</Label>
                <Input value={businessType} onChange={(e) => setBusinessType(e.target.value)} placeholder="ХХК, ХХН, Хувь хүн..." />
              </div>
              <div>
                <Label>Регистрийн дугаар</Label>
                <Input value={registerNumber} onChange={(e) => setRegisterNumber(e.target.value)} placeholder="1234567" />
              </div>
              <div>
                <Label>И-мэйл *</Label>
                <Input required type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
              </div>
              <div>
                <Label>Нууц үг *</Label>
                <Input required type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
              </div>
            </div>
            <div className="flex gap-2 pt-2">
              <Button type="button" variant="outline" onClick={() => setStep("landing")} className="flex-1">Буцах</Button>
              <Button type="submit" className="flex-1" disabled={loading}>
                {loading ? "Үүсгэж байна..." : "Бүртгүүлэх"}
              </Button>
            </div>
          </form>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border">
        <div className="container mx-auto flex h-16 items-center justify-between px-4">
          <Link to="/" className="text-2xl font-bold">Only</Link>
          <Link to="/merchant/login"><Button variant="ghost" size="sm">Нэвтрэх</Button></Link>
        </div>
      </header>

      <section className="container mx-auto px-4 py-20 text-center">
        <div className="mx-auto max-w-2xl">
          <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/5 px-4 py-1.5 text-sm text-primary">
            <Zap className="h-4 w-4" /> Монголын онлайн зах зээл дээр гараарай
          </div>
          <h1 className="text-4xl font-bold md:text-5xl">
            Дэлгүүрээ Only.mn-д нээж<br/>
            <span className="text-primary">олон мянган</span> хэрэглэгчид хүр
          </h1>
          <p className="mx-auto mt-6 max-w-lg text-muted-foreground">
            Taobao, Amazon, Dewu-тай адил — манай нэгдсэн платформд барааг байршуулж, автомат төлбөр тооцоо болон хүргэлтийн системийг ашигла.
          </p>
          <Button size="lg" className="mt-8" onClick={() => setStep("form")}>
            Дэлгүүр нээх — Үнэгүй
          </Button>
        </div>
      </section>

      <section className="container mx-auto grid gap-6 px-4 pb-20 md:grid-cols-3">
        {[
          { icon: Store, title: "Тохиргоо хялбар", desc: "Хэдхэн минутад дэлгүүрээ нээж, бараагаа нэм. Техникийн мэдлэг шаардахгүй." },
          { icon: ShieldCheck, title: "Аюулгүй, итгэлтэй", desc: "Баталгаажуулалтын дараа таны дэлгүүр идэвхждэг. Хэрэглэгчийн итгэлийг хамгаална." },
          { icon: TrendingUp, title: "Тайлан, аналитик", desc: "Борлуулалт, захиалга, орлогоо бодит цагт хянах." },
        ].map((f) => (
          <Card key={f.title} className="rounded-2xl p-6">
            <f.icon className="mb-3 h-8 w-8 text-primary" />
            <h3 className="font-semibold">{f.title}</h3>
            <p className="mt-1 text-sm text-muted-foreground">{f.desc}</p>
          </Card>
        ))}
      </section>
    </div>
  );
}
