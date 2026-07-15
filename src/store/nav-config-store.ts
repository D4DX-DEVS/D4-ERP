import { create } from "zustand";
import { getDocuments, updateDocument, createDocument, where, Timestamp } from "@/lib/firestore";
import type { NavigationConfig } from "@/types";

interface NavConfigStore {
  config: NavigationConfig | null;
  loaded: boolean;
  fetchConfig: () => Promise<void>;
  setConfig: (config: NavigationConfig) => void;
}

export const useNavConfigStore = create<NavConfigStore>((set) => ({
  config: null,
  loaded: false,

  fetchConfig: async () => {
    try {
      const docs = await getDocuments<NavigationConfig>("settings", [
        where("key", "==", "navigationConfig"),
      ]);
      const config = docs.length > 0 ? docs[0] : null;
      set({ config, loaded: true });
    } catch (error) {
      set({ config: null, loaded: true });
    }
  },

  setConfig: (config: NavigationConfig) => {
    set({ config });
  },
}));
