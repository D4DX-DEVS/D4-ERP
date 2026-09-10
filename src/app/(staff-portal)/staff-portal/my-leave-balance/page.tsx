"use client";

// The employee's own leave ledger, read-only. It renders the same panel the
// admin edits from, so a correction an admin makes is the number shown here.

import { useEffect, useState } from "react";
import Link from "next/link";
import { useAuthStore } from "@/store/auth-store";
import { getDocument } from "@/lib/firestore";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState, PageLoader } from "@/components/ui/loading";
import { LeaveBalancePanel } from "@/components/leaves/leave-balance-panel";
import { CalendarPlus } from "lucide-react";
import type { Staff } from "@/types";

export default function MyLeaveBalancePage() {
  const { user } = useAuthStore();
  const [staff, setStaff] = useState<Staff | null>(null);
  const [loading, setLoading] = useState(true);
  const [year, setYear] = useState(new Date().getFullYear());

  const staffId = user?.staffId;

  useEffect(() => {
    if (!staffId) return;
    let alive = true;
    getDocument<Staff>("staff", staffId)
      .then((s) => {
        if (!alive) return;
        setStaff(s);
        setLoading(false);
      })
      .catch(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [staffId]);

  if (loading) return <PageLoader />;

  if (!staff) {
    return (
      <Card>
        <CardContent>
          <EmptyState
            title="Leave balance unavailable"
            description="We could not load your staff record. Ask an admin to check your profile."
          />
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-gray-900 sm:text-2xl">My Leave Balance</h1>
          <p className="mt-1 text-sm text-gray-500">
            Days you have taken, what is left, and the week-offs you worked.
          </p>
        </div>
        <Link href="/staff-portal/leave">
          <Button variant="outline" size="sm">
            <CalendarPlus className="mr-2 h-4 w-4" />
            Request leave
          </Button>
        </Link>
      </div>

      <LeaveBalancePanel staff={staff} year={year} canEdit={false} user={user} onYearChange={setYear} />
    </div>
  );
}
