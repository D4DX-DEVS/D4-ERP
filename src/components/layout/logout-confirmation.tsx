"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, LogOut, ShieldCheck } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useAuthStore } from "@/store/auth-store";

interface LogoutConfirmationProps {
  title: string;
  description: string;
  backHref: string;
  loginHref: string;
  audienceLabel: string;
}

export function LogoutConfirmation({
  title,
  description,
  backHref,
  loginHref,
  audienceLabel,
}: LogoutConfirmationProps) {
  const router = useRouter();
  const { logout } = useAuthStore();
  const [isPending, startTransition] = useTransition();
  const [isLeaving, setIsLeaving] = useState(false);

  const handleConfirm = () => {
    setIsLeaving(true);
    logout();
    startTransition(() => {
      router.replace(loginHref);
    });
  };

  return (
    <div className="mesh-bg flex min-h-[calc(100vh-12rem)] items-center justify-center px-4 py-6 sm:px-6 lg:px-8">
      <Card className="w-full max-w-2xl rounded-[36px]">
        <CardHeader className="pb-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="eyebrow">{audienceLabel}</p>
              <CardTitle className="mt-4 text-3xl sm:text-[2rem]">{title}</CardTitle>
              <CardDescription className="mt-2 max-w-xl">{description}</CardDescription>
            </div>
            <div className="hidden h-16 w-16 items-center justify-center rounded-[22px] bg-gradient-to-br from-slate-900 to-slate-700 text-white sm:flex">
              <ShieldCheck className="h-7 w-7" />
            </div>
          </div>
        </CardHeader>

        <CardContent className="space-y-6">
          <div className="rounded-[28px] border border-white/70 bg-white/70 p-5 text-sm leading-7 text-slate-600">
            Your current session will be cleared from this device. You can sign back in any time from the appropriate login screen.
          </div>

          <div className="flex flex-col gap-3 sm:flex-row">
            <Button variant="outline" className="w-full sm:w-auto" onClick={() => router.push(backHref)}>
              <ArrowLeft className="h-4 w-4" />
              Stay signed in
            </Button>
            <Button className="w-full sm:ml-auto sm:w-auto" onClick={handleConfirm} disabled={isLeaving || isPending}>
              <LogOut className="h-4 w-4" />
              {isLeaving || isPending ? "Signing out..." : "Confirm sign out"}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}