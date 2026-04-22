"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/store/auth-store";

export default function Home() {
  const { user, isLoading } = useAuthStore();
  const router = useRouter();

  useEffect(() => {
    if (!isLoading) {
      if (user) {
        if (user.role === "staff") {
          router.push("/staff-portal");
        } else {
          router.push("/dashboard");
        }
      } else {
        router.push("/login");
      }
    }
  }, [user, isLoading, router]);

  return (
    <div className="mesh-bg flex min-h-screen items-center justify-center px-6">
      <div className="glass-panel flex items-center gap-4 rounded-[28px] px-6 py-5 text-slate-700">
        <div className="h-10 w-10 animate-spin rounded-full border-[3px] border-teal-600/20 border-t-teal-600" />
        <div>
          <p className="text-sm font-semibold text-slate-950">Preparing sign-in flow</p>
          <p className="text-sm text-slate-500">Checking your session and routing you to the right workspace.</p>
        </div>
      </div>
    </div>
  );
}
