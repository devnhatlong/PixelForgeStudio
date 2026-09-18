import { create } from "zustand";

export type HomeView = "recent" | "marketplace" | "trash";
export type ModalKind = "newSprite" | "auth" | "export" | "pngToPixel" | "cloud" | "publish" | null;

type AppState = {
  homeView: HomeView;
  modal: ModalKind;
  toast: { message: string; kind: "info" | "error" | "success" } | null;
  /** label of a blocking global operation (opening a project, converting an image…) */
  loading: string | null;
  /** folder currently open on the home screen (null = root); new sprites are created inside it */
  activeFolderId: string | null;
  setActiveFolderId: (id: string | null) => void;
  setLoading: (label: string | null) => void;
  setHomeView: (v: HomeView) => void;
  openModal: (m: ModalKind) => void;
  closeModal: () => void;
  notify: (message: string, kind?: "info" | "error" | "success") => void;
};

let toastTimer: ReturnType<typeof setTimeout> | null = null;

export const useAppStore = create<AppState>((set) => ({
  homeView: "recent",
  modal: null,
  toast: null,
  loading: null,
  activeFolderId: null,
  setActiveFolderId: (activeFolderId) => set({ activeFolderId }),
  setLoading: (loading) => set({ loading }),
  setHomeView: (homeView) => set({ homeView }),
  openModal: (modal) => set({ modal }),
  closeModal: () => set({ modal: null }),
  notify: (message, kind = "info") => {
    set({ toast: { message, kind } });
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(() => set({ toast: null }), 3200);
  },
}));
