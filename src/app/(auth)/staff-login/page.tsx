"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/store/auth-store";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowLeft, CheckCircle2, Loader2, ShieldCheck, User } from "lucide-react";
import Link from "next/link";

export default function StaffLoginPage() {
  const [mobile, setMobile] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const { setUser } = useAuthStore();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const res = await fetch("/api/auth/staff-login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ employeeCode: code, mobile }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Login failed. Please try again.");
        setLoading(false);
        return;
      }

      setUser(data.user);
      router.push("/staff-portal");
    } catch {
      setError("Login failed. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mesh-bg relative min-h-screen overflow-hidden px-4 py-5 sm:px-6 lg:px-8 lg:py-8">
      <div className="ambient-orb absolute left-[6%] top-[12%] h-44 w-44 rounded-full bg-emerald-300/20 blur-3xl" />
      <div className="ambient-orb absolute bottom-[14%] right-[10%] h-52 w-52 rounded-full bg-cyan-300/20 blur-3xl" />

      <div className="page-frame grid min-h-[calc(100vh-2.5rem)] items-center gap-6 lg:grid-cols-[0.96fr_1.04fr] lg:gap-8">
        <Card className="order-2 w-full max-w-xl justify-self-center rounded-[36px] lg:order-1">
          <CardHeader className="pb-3 text-center sm:text-left">
            <div className="mb-5 flex items-center justify-center sm:justify-start">
              <div className="flex h-16 w-16 items-center justify-center rounded-[22px] bg-gradient-to-br from-emerald-600 via-teal-600 to-cyan-500 text-white shadow-[0_18px_44px_rgba(16,185,129,0.25)]">
                <User className="h-8 w-8" />
              </div>
            </div>
            <CardTitle className="text-3xl sm:text-[2rem]">Staff portal login</CardTitle>
            <CardDescription>Use your employee code and mobile digits to open your personal workspace.</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleLogin} className="space-y-5">
            {error && (
              <div className="rounded-[22px] border border-orange-200 bg-orange-50/90 p-4 text-sm text-orange-700">
                {error}
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="mobile">Mobile Number (Last 4 digits)</Label>
              <Input
                id="mobile"
                type="text"
                placeholder="1234"
                maxLength={4}
                pattern="[0-9]{4}"
                value={mobile}
                onChange={(e) => setMobile(e.target.value.replace(/\D/g, ""))}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="code">Employee Code</Label>
              <Input
                id="code"
                type="text"
                placeholder="ABC123"
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                required
              />
            </div>
            <Button type="submit" className="w-full bg-emerald-600 hover:bg-emerald-700" disabled={loading}>
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Logging in...
                </>
              ) : (
                "Open my portal"
              )}
            </Button>
            <div className="rounded-[22px] border border-white/70 bg-white/60 px-4 py-4 text-center sm:text-left">
              <p className="text-sm font-medium text-slate-900">Need admin access instead?</p>
              <Link href="/login" className="mt-2 inline-flex items-center gap-2 text-sm font-semibold text-emerald-700 hover:text-emerald-800">
                <ArrowLeft className="h-4 w-4" />
                Go to admin login
              </Link>
            </div>
          </form>
          </CardContent>
        </Card>

        <section className="glass-panel order-1 rounded-[36px] px-8 py-10 text-slate-950 lg:order-2">
          <p className="eyebrow">D4 Staff Space</p>
          <div className="mt-6 max-w-xl space-y-5">
            <h1 className="text-5xl font-semibold leading-[1.02] tracking-[-0.06em]">
              A lighter portal for attendance, tasks, and leave.
            </h1>
            <p className="max-w-lg text-base leading-7 text-slate-600">
              Staff can check in, manage requests, and stay updated without navigating a cluttered back-office UI.
            </p>
          </div>

          <div className="mt-10 grid gap-4 sm:grid-cols-2">
            {[
              { icon: CheckCircle2, title: "Fast daily actions", text: "Attendance, leave, and personal tasks stay a tap away." },
              { icon: ShieldCheck, title: "Personalized access", text: "Each employee sees only their own relevant workspace and records." },
            ].map((feature) => (
              <div key={feature.title} className="rounded-[28px] border border-white/70 bg-white/70 p-5 shadow-[0_16px_36px_rgba(15,23,42,0.06)]">
                <feature.icon className="h-5 w-5 text-emerald-700" />
                <h2 className="mt-4 text-lg font-semibold tracking-[-0.03em]">{feature.title}</h2>
                <p className="mt-2 text-sm leading-6 text-slate-500">{feature.text}</p>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
