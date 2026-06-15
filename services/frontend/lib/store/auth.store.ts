import { create } from 'zustand';
import { User } from '@/types/api';
import Cookie from 'js-cookie';

interface AuthStore {
  user: User | null;
  token: string | null;
  refreshToken: string | null;
  isAuthenticated: boolean;
  setAuth: (user: User, token: string, refreshToken: string) => void;
  logout: () => void;
  updateUser: (user: User) => void;
  loadFromStorage: () => void;
}

export const useAuthStore = create<AuthStore>((set) => ({
  user: null,
  token: null,
  refreshToken: null,
  isAuthenticated: false,

  setAuth: (user, token, refreshToken) => {
    // Set tokens with 1 day expiry for better UX
    Cookie.set('accessToken', token, { expires: 1 });
    Cookie.set('refreshToken', refreshToken, { expires: 1 });
    // Also store user in localStorage for persistence
    if (typeof window !== 'undefined') {
      localStorage.setItem('user', JSON.stringify(user));
    }
    set({
      user,
      token,
      refreshToken,
      isAuthenticated: true,
    });
  },

  logout: () => {
    Cookie.remove('accessToken');
    Cookie.remove('refreshToken');
    if (typeof window !== 'undefined') {
      localStorage.removeItem('user');
    }
    set({
      user: null,
      token: null,
      refreshToken: null,
      isAuthenticated: false,
    });
  },

  updateUser: (user) => {
    set({ user });
  },

  loadFromStorage: () => {
    // Skip if running on server
    if (typeof window === 'undefined') {
      return;
    }

    const token = Cookie.get('accessToken');
    const refreshToken = Cookie.get('refreshToken');
    let user = null;

    const storedUser = localStorage.getItem('user');
    if (storedUser) {
      try {
        user = JSON.parse(storedUser);
      } catch {
        localStorage.removeItem('user');
      }
    }

    // Only set authenticated if we have both tokens
    if (token && refreshToken) {
      set({
        token,
        refreshToken,
        user,
        isAuthenticated: true,
      });
    } else {
      // Ensure we're explicitly not authenticated if tokens are missing
      set({
        token: null,
        refreshToken: null,
        user: null,
        isAuthenticated: false,
      });
    }
  },
}));

