import { create } from 'zustand';
import axios from 'axios';
import { getConfig } from './config';

export interface AuthUser {
  id: number;
  username: string;
  fullName: string;
  role: string;
  branchId: number;
  companyId: number;
  branch?: {
    id: number;
    name: string;
    code: string;
    isMaster?: boolean;
    company?: { id: number; name: string };
  };
}

interface AuthState {
  user: AuthUser | null;
  token: string | null;
  isAuthenticated: boolean;
  isHydrated: boolean;
  login: (token: string, user: AuthUser) => void;
  logout: () => Promise<void>;
  hydrate: () => Promise<void>;
  refreshAccessToken: () => Promise<string | null>;
  setToken: (token: string) => void;
}

const API_BASE = getConfig().apiUrl;

/** Decode JWT payload and check expiry without a library */
function isTokenExpired(token: string): boolean {
  try {
    const payload = JSON.parse(atob(token.split('.')[1]));
    // Treat as expired 60s before actual expiry to allow proactive refresh
    return payload.exp * 1000 < Date.now() + 60_000;
  } catch {
    return true;
  }
}

/** Get seconds until token expires (for scheduling refresh) */
function tokenExpiresIn(token: string): number {
  try {
    const payload = JSON.parse(atob(token.split('.')[1]));
    return Math.max(0, payload.exp * 1000 - Date.now() - 60_000);
  } catch {
    return 0;
  }
}

let refreshTimer: ReturnType<typeof setTimeout> | null = null;

function scheduleRefresh(token: string) {
  if (refreshTimer) clearTimeout(refreshTimer);
  const ms = tokenExpiresIn(token);
  if (ms > 0) {
    refreshTimer = setTimeout(() => {
      useAuthStore.getState().refreshAccessToken();
    }, ms);
  }
}

function clearRefreshTimer() {
  if (refreshTimer) {
    clearTimeout(refreshTimer);
    refreshTimer = null;
  }
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  token: null,
  isAuthenticated: false,
  isHydrated: false,

  login: (token, user) => {
    // Store only user info in sessionStorage (for tab persistence)
    // Access token stays in memory only — not in localStorage
    sessionStorage.setItem('jewelerp_user', JSON.stringify(user));
    set({ token, user, isAuthenticated: true, isHydrated: true });
    scheduleRefresh(token);
  },

  setToken: (token) => {
    set({ token });
    scheduleRefresh(token);
  },

  logout: async () => {
    clearRefreshTimer();
    const token = get().token;
    try {
      // Call server logout to revoke refresh token cookie
      await axios.post(`${API_BASE}/auth/logout`, null, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        withCredentials: true,
      });
    } catch { /* best effort */ }
    sessionStorage.removeItem('jewelerp_user');
    // Also clean up legacy localStorage if present
    localStorage.removeItem('jewelerp_token');
    localStorage.removeItem('jewelerp_user');
    set({ token: null, user: null, isAuthenticated: false });
  },

  hydrate: async () => {
    // Try to get a new access token from the refresh cookie
    try {
      const res = await axios.post(`${API_BASE}/auth/refresh`, null, {
        withCredentials: true,
      });
      if (res.data.token && res.data.user) {
        set({ token: res.data.token, user: res.data.user, isAuthenticated: true, isHydrated: true });
        scheduleRefresh(res.data.token);
        sessionStorage.setItem('jewelerp_user', JSON.stringify(res.data.user));
        return;
      }
    } catch {
      // No valid refresh token — user needs to log in
    }

    // Clean up any stale data
    sessionStorage.removeItem('jewelerp_user');
    localStorage.removeItem('jewelerp_token');
    localStorage.removeItem('jewelerp_user');
    set({ isHydrated: true });
  },

  refreshAccessToken: async () => {
    try {
      const res = await axios.post(`${API_BASE}/auth/refresh`, null, {
        withCredentials: true,
      });
      if (res.data.token) {
        set({ token: res.data.token, user: res.data.user });
        sessionStorage.setItem('jewelerp_user', JSON.stringify(res.data.user));
        scheduleRefresh(res.data.token);
        return res.data.token;
      }
    } catch {
      // Refresh failed — force logout
      clearRefreshTimer();
      sessionStorage.removeItem('jewelerp_user');
      set({ token: null, user: null, isAuthenticated: false });
    }
    return null;
  },
}));
