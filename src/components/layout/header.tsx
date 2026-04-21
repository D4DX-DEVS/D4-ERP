"use client";

import { useRouter } from "next/navigation";
import { useAuthStore } from "@/store/auth-store";
import { signOut } from "firebase/auth";
import { auth } from "@/lib/firebase";
import { Bell, LogOut, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getInitials } from "@/lib/utils";

export function Header() {
  const { user, logout } = useAuthStore();
  const router = useRouter();

  const handleLogout = async () => {
    try {
      await signOut(auth);
    } catch {
      // Continue even if Firebase signout fails (staff use custom auth)
    }
    logout();
    router.push("/login");
  };

  return (
    <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-gray-200 bg-white px-6">
      <div>
        <h2 className="text-sm text-gray-500">Welcome back,</h2>
        <p className="font-semibold text-gray-900">
          {user?.firstName} {user?.lastName}
        </p>
      </div>

      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" className="relative" onClick={() => router.push("/dashboard/notifications")}>
          <Bell className="h-5 w-5 text-gray-500" />
          <span className="absolute -right-0.5 -top-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[10px] text-white">
            3
          </span>
        </Button>

        <div className="flex items-center gap-2 rounded-lg border border-gray-200 px-3 py-1.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-100 text-blue-700 text-sm font-semibold">
            {user ? getInitials(user.firstName, user.lastName) : <User className="h-4 w-4" />}
          </div>
          <div className="hidden sm:block">
            <p className="text-sm font-medium">{user?.firstName} {user?.lastName}</p>
            <p className="text-xs text-gray-500 capitalize">{user?.role?.replace("-", " ")}</p>
          </div>
        </div>

        <Button variant="ghost" size="icon" onClick={handleLogout} title="Logout">
          <LogOut className="h-5 w-5 text-gray-500" />
        </Button>
      </div>
    </header>
  );
}
