import { create } from "zustand";

export type Screen = "home" | "editor";
export type HomeView = "recent" | "marketplace" | "trash";
export type ModalKind = "newSprite" | "auth" | "export" | "pngToPixel" | "cloud" | "publish" | null;

type AppState = {
  screen: Screen;
  homeView: HomeView;
  modal: ModalKind;
  toast: { message: string; kind: "info" | "error" | "success" } | null;
  setScreen: (s: Screen) => void;
  setHomeView: (v: HomeView) => void;
  openModal: (m: ModalKind) => void;
  closeModal: () => void;
  notify: (message: string, kind?: "info" | "error" | "success") => void;
};

let toastTimer: ReturnType<typeof setTimeout> | null = null;

export const useAppStore = create<AppState>((set) => ({
  screen: "home",
  homeView: "recent",
  modal: null,
  toast: null,
  setScreen: (screen) => set({ screen }),
  setHomeView: (homeView) => set({ homeView }),
  openModal: (modal) => set({ modal }),
  closeModal: () => set({ modal: null }),
  notify: (message, kind = "info") => {
    set({ toast: { message, kind } });
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(() => set({ toast: null }), 3200);
  },
}));
