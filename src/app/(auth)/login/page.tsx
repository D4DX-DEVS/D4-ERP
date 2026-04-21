"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { signInWithEmailAndPassword } from "firebase/auth";
import { auth } from "@/lib/firebase";
import { getDocuments, where } from "@/lib/firestore";
import { useAuthStore } from "@/store/auth-store";
import { Staff } from "@/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Building2, Loader2 } from "lucide-react";
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
      const userCredential = await signInWithEmailAndPassword(auth, email, password);
      const uid = userCredential.user.uid;

      // Get staff record by email
      const staffList = await getDocuments<Staff>("staff", [
        where("email", "==", email),
        where("isActive", "==", true),
      ]);

      if (staffList.length === 0) {
        setError("No active staff account found for this email");
        setLoading(false);
        return;
      }

      const staff = staffList[0];

      if (staff.role === "staff") {
        setError("Staff members should use the Staff Login portal");
        setLoading(false);
        return;
      }

      setUser({
        uid,
        email: staff.email,
        role: staff.role,
        staffId: staff.id,
        firstName: staff.firstName,
        lastName: staff.lastName,
        companyId: staff.companyId,
        departmentId: staff.departmentId,
      });

      router.push("/dashboard");
    } catch {
      setError("Invalid email or password");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100 p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-blue-600 text-white">
            <Building2 className="h-8 w-8" />
          </div>
          <CardTitle className="text-2xl">D4 Media ERP</CardTitle>
          <CardDescription>Sign in to admin dashboard</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleLogin} className="space-y-4">
            {error && (
              <div className="rounded-lg bg-red-50 p-3 text-sm text-red-600">
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
                "Sign In"
              )}
            </Button>
            <div className="text-center">
              <Link href="/staff-login" className="text-sm text-blue-600 hover:underline">
                Staff Login →
              </Link>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
