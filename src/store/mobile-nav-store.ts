import { create } from "zustand";

interface MobileNavStore {
  open: boolean;
  setOpen: (open: boolean) => void;
  toggle: () => void;
}

/** Shared open state for the admin mobile drawer — the sidebar's hamburger and the
 * bottom bar's "More" tab both toggle the same drawer instead of each owning a copy. */
export const useMobileNavStore = create<MobileNavStore>((set) => ({
  open: false,
  setOpen: (open) => set({ open }),
  toggle: () => set((s) => ({ open: !s.open })),
}));
