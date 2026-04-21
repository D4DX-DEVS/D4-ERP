"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { getDocuments, where } from "@/lib/firestore";
import { useAuthStore } from "@/store/auth-store";
import { Staff } from "@/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { User, Loader2 } from "lucide-react";
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
      // Find staff by mobile (last 4 digits) and employee code
      const staffList = await getDocuments<Staff>("staff", [
        where("employeeCode", "==", code.toUpperCase()),
        where("isActive", "==", true),
      ]);

      if (staffList.length === 0) {
        setError("Invalid employee code");
        setLoading(false);
        return;
      }

      const staff = staffList[0];

      // Verify mobile last 4 digits
      const mobileLast4 = staff.mobile.slice(-4);
      if (mobileLast4 !== mobile.slice(-4)) {
        setError("Mobile number does not match");
        setLoading(false);
        return;
      }

      if (staff.status === "terminated") {
        setError("Your account has been terminated");
        setLoading(false);
        return;
      }

      if (staff.status === "suspended") {
        setError("Your account is currently suspended");
        setLoading(false);
        return;
      }

      setUser({
        uid: staff.id,
        email: staff.email,
        role: staff.role,
        staffId: staff.id,
        firstName: staff.firstName,
        lastName: staff.lastName,
        companyId: staff.companyId,
        departmentId: staff.departmentId,
      });

      router.push("/staff-portal");
    } catch {
      setError("Login failed. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-emerald-50 to-teal-100 p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-emerald-600 text-white">
            <User className="h-8 w-8" />
          </div>
          <CardTitle className="text-2xl">Staff Portal</CardTitle>
          <CardDescription>Login with your mobile number & employee code</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleLogin} className="space-y-4">
            {error && (
              <div className="rounded-lg bg-red-50 p-3 text-sm text-red-600">
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
                "Login"
              )}
            </Button>
            <div className="text-center">
              <Link href="/login" className="text-sm text-emerald-600 hover:underline">
                ← Admin Login
              </Link>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
