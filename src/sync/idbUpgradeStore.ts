import { create } from "zustand";

// phase-8-review.md MEDIUM-4 — getIdb()'s `blocked` callback (src/sync/db.ts)
// sets this so the UI can surface "close other tabs" instead of a silent
// hang (every IndexedDB write just stalls forever with no error, no
// timeout, nothing observable, while an upgrade transaction is blocked).
// Cleared once the open finally resolves, however it got there.
interface IdbUpgradeState {
  blocked: boolean;
  setBlocked: (blocked: boolean) => void;
}

export const useIdbUpgradeStore = create<IdbUpgradeState>((set) => ({
  blocked: false,
  setBlocked: (blocked) => set({ blocked }),
}));
