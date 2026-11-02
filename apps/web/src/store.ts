import { create } from "zustand";
type Selection = {
  device: string | null;
  browser: string | null;
  profile: string | null;
  selectDevice: (id: string) => void;
  selectBrowser: (id: string | null) => void;
  selectProfile: (id: string) => void;
  clear: () => void;
};
export const useSelection = create<Selection>((set) => ({
  device: null,
  browser: null,
  profile: null,
  selectDevice: (device) => set({ device, browser: null, profile: null }),
  selectBrowser: (browser) => set({ browser, profile: null }),
  selectProfile: (profile) => set({ profile }),
  clear: () => set({ device: null, browser: null, profile: null }),
}));
