import { create } from "zustand";
import Cookie from "js-cookie";
import { ADMIN_COOKIE } from "@/lib/api/admin-client";
import type { PlatformAdmin } from "@/lib/api/admin";

const ADMIN_STORAGE = "dsAdmin";

interface AdminStore {
  admin: PlatformAdmin | null;
  token: string | null;
  isAuthenticated: boolean;
  hydrated: boolean;
  setAuth: (admin: PlatformAdmin, token: string, expiresInSeconds: number) => void;
  setAdmin: (admin: PlatformAdmin) => void;
  logout: () => void;
  loadFromStorage: () => void;
}

export const useAdminStore = create<AdminStore>((set) => ({
  admin: null,
  token: null,
  isAuthenticated: false,
  hydrated: false,

  setAuth: (admin, token, expiresInSeconds) => {
    const expires = Math.max(1 / 24, expiresInSeconds / 86400); // days, min ~1h
    Cookie.set(ADMIN_COOKIE, token, { expires, sameSite: "lax" });
    if (typeof window !== "undefined") {
      localStorage.setItem(ADMIN_STORAGE, JSON.stringify(admin));
    }
    set({ admin, token, isAuthenticated: true });
  },

  setAdmin: (admin) => {
    if (typeof window !== "undefined") {
      localStorage.setItem(ADMIN_STORAGE, JSON.stringify(admin));
    }
    set({ admin });
  },

  logout: () => {
    Cookie.remove(ADMIN_COOKIE);
    if (typeof window !== "undefined") {
      localStorage.removeItem(ADMIN_STORAGE);
    }
    set({ admin: null, token: null, isAuthenticated: false });
  },

  loadFromStorage: () => {
    if (typeof window === "undefined") return;
    const token = Cookie.get(ADMIN_COOKIE);
    let admin: PlatformAdmin | null = null;
    const stored = localStorage.getItem(ADMIN_STORAGE);
    if (stored) {
      try {
        admin = JSON.parse(stored);
      } catch {
        localStorage.removeItem(ADMIN_STORAGE);
      }
    }
    if (token) {
      set({ token, admin, isAuthenticated: true, hydrated: true });
    } else {
      set({ token: null, admin: null, isAuthenticated: false, hydrated: true });
    }
  },
}));
