import { create } from "zustand";

export type SyncStatus = "offline" | "idle" | "pending" | "syncing" | "synced" | "error";

type SyncState = {
  status: SyncStatus;
  pending: number;
  lastError: string | null;
  lastSyncedAt: number | null;
  set: (patch: Partial<Omit<SyncState, "set">>) => void;
};

/** UI-facing state of the cloud sync engine (see lib/sync.ts). */
export const useSyncStore = create<SyncState>((set) => ({
  status: "offline",
  pending: 0,
  lastError: null,
  lastSyncedAt: null,
  set: (patch) => set(patch),
}));
