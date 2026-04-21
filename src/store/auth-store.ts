"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import { AuthUser } from "@/types";
import { setAuditUser } from "@/lib/firestore";

interface AuthState {
  user: AuthUser | null;
  isLoading: boolean;
  setUser: (user: AuthUser | null) => void;
  setLoading: (loading: boolean) => void;
  logout: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      isLoading: true,
      setUser: (user) => {
        setAuditUser(user ? { uid: user.uid, firstName: user.firstName, lastName: user.lastName } : null);
        set({ user, isLoading: false });
      },
      setLoading: (isLoading) => set({ isLoading }),
      logout: () => {
        setAuditUser(null);
        set({ user: null, isLoading: false });
      },
    }),
    {
      name: "d4media-auth",
      partialize: (state) => ({ user: state.user }),
      onRehydrateStorage: () => (state) => {
        // Re-set audit user when store rehydrates from localStorage
        if (state?.user) {
          setAuditUser({ uid: state.user.uid, firstName: state.user.firstName, lastName: state.user.lastName });
        }
      },
    }
  )
);
