"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/store/auth-store";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowRight, Building2, CheckCircle2, Loader2, ShieldCheck } from "lucide-react";
import Link from "next/link";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const { setUser } = useAuthStore();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Invalid email or password");
        setLoading(false);
        return;
      }

      setUser(data.user);
      router.push("/dashboard");
    } catch {
      setError("Invalid email or password");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mesh-bg relative min-h-screen overflow-hidden px-4 py-5 sm:px-6 lg:px-8 lg:py-8">
      <div className="ambient-orb absolute right-[8%] top-[12%] h-40 w-40 rounded-full bg-teal-300/20 blur-3xl" />
      <div className="ambient-orb absolute bottom-[10%] left-[6%] h-52 w-52 rounded-full bg-amber-300/20 blur-3xl" />

      <div className="page-frame grid min-h-[calc(100vh-2.5rem)] items-center gap-6 lg:grid-cols-[1.08fr_0.92fr] lg:gap-8">
        <section className="glass-panel hidden rounded-[36px] px-8 py-10 text-slate-950 lg:block">
          <p className="eyebrow">D4 Media ERP</p>
          <div className="mt-6 max-w-xl space-y-5">
            <h1 className="text-5xl font-semibold leading-[1.02] tracking-[-0.06em]">
              Admin operations with a cleaner, calmer control room.
            </h1>
            <p className="max-w-lg text-base leading-7 text-slate-600">
              Review teams, finance, attendance, and system controls from one polished workspace designed for quick scanning and decisive action.
            </p>
          </div>

          <div className="mt-10 grid gap-4 sm:grid-cols-2">
            {[
              { icon: ShieldCheck, title: "Role-secured access", text: "Admin, department, and accounts views stay properly segmented." },
              { icon: CheckCircle2, title: "Unified workflow", text: "The same visual system carries through pages, lists, and task surfaces." },
            ].map((feature) => (
              <div key={feature.title} className="rounded-[28px] border border-white/70 bg-white/70 p-5 shadow-[0_16px_36px_rgba(15,23,42,0.06)]">
                <feature.icon className="h-5 w-5 text-teal-700" />
                <h2 className="mt-4 text-lg font-semibold tracking-[-0.03em]">{feature.title}</h2>
                <p className="mt-2 text-sm leading-6 text-slate-500">{feature.text}</p>
              </div>
            ))}
          </div>
        </section>

        <Card className="w-full max-w-xl justify-self-center rounded-[36px]">
          <CardHeader className="pb-3 text-center sm:text-left">
            <div className="mb-5 flex items-center justify-center sm:justify-start">
              <div className="flex h-16 w-16 items-center justify-center rounded-[22px] bg-gradient-to-br from-teal-700 via-teal-600 to-emerald-500 text-white shadow-[0_18px_44px_rgba(15,118,110,0.25)]">
                <Building2 className="h-8 w-8" />
              </div>
            </div>
            <CardTitle className="text-3xl sm:text-[2rem]">Admin sign in</CardTitle>
            <CardDescription>Access finance, operations, and team controls from a single dashboard.</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleLogin} className="space-y-5">
            {error && (
              <div className="rounded-[22px] border border-orange-200 bg-orange-50/90 p-4 text-sm text-orange-700">
                {error}
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="admin@d4media.in"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Signing in...
                </>
              ) : (
                <>
                  Continue to dashboard
                  <ArrowRight className="h-4 w-4" />
                </>
              )}
            </Button>
            <div className="rounded-[22px] border border-white/70 bg-white/60 px-4 py-4 text-center sm:text-left">
              <p className="text-sm font-medium text-slate-900">Signing in as staff instead?</p>
              <Link href="/staff-login" className="mt-2 inline-flex items-center gap-2 text-sm font-semibold text-teal-700 hover:text-teal-800">
                Open staff portal
                <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
