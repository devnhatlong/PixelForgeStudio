import { create } from "zustand";
import { api, setTokenGetter } from "@/lib/api";

export interface User {
  id: string;
  email: string;
  name: string;
}

type AuthState = {
  user: User | null;
  token: string | null;
  ready: boolean;
  restore: () => Promise<void>;
  login: (email: string, password: string, remember: boolean) => Promise<void>;
  register: (email: string, password: string, name: string, remember: boolean) => Promise<void>;
  logout: () => void;
};

const KEY = "pf_auth";

function persist(token: string, user: User, remember: boolean) {
  const payload = JSON.stringify({ token, user });
  try {
    (remember ? localStorage : sessionStorage).setItem(KEY, payload);
    (remember ? sessionStorage : localStorage).removeItem(KEY);
  } catch {
    /* ignore */
  }
}

export const useAuthStore = create<AuthState>((set, get) => {
  setTokenGetter(() => get().token);
  return {
    user: null,
    token: null,
    ready: false,
    restore: async () => {
      let raw: string | null = null;
      try {
        raw = localStorage.getItem(KEY) ?? sessionStorage.getItem(KEY);
      } catch {
        /* ignore */
      }
      if (!raw) return set({ ready: true });
      try {
        const { token, user } = JSON.parse(raw) as { token: string; user: User };
        set({ token, user });
        const me = await api.get<User>("/auth/me");
        set({ user: me, ready: true });
      } catch (e) {
        // token invalid or server offline: keep cached user only if network error
        if ((e as { status?: number }).status === 401) {
          set({ token: null, user: null });
          try {
            localStorage.removeItem(KEY);
            sessionStorage.removeItem(KEY);
          } catch {
            /* ignore */
          }
        }
        set({ ready: true });
      }
    },
    login: async (email, password, remember) => {
      const res = await api.post<{ token: string; user: User }>("/auth/login", { email, password });
      persist(res.token, res.user, remember);
      set({ token: res.token, user: res.user });
    },
    register: async (email, password, name, remember) => {
      const res = await api.post<{ token: string; user: User }>("/auth/register", { email, password, name });
      persist(res.token, res.user, remember);
      set({ token: res.token, user: res.user });
    },
    logout: () => {
      try {
        localStorage.removeItem(KEY);
        sessionStorage.removeItem(KEY);
      } catch {
        /* ignore */
      }
      set({ token: null, user: null });
    },
  };
});
