import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';

import {
  api,
  ApiError,
  SessionExpiredError,
  type AuthClient,
  type AuthTokens,
  type CustomerRegisterData,
  type CustomerUser,
  type DriverProfile,
  type DriverRegisterData,
} from './api';
import { useRole, type Role } from './role';

const STORAGE_KEYS: Record<Role, string> = {
  customer: '@goxe/auth_customer',
  driver: '@goxe/auth_driver',
};

// Refresh a little before the access token actually expires.
const EXPIRY_MARGIN_MS = 30_000;

type Sessions = {
  customer: { profile: CustomerUser; tokens: AuthTokens } | null;
  driver: { profile: DriverProfile; tokens: AuthTokens } | null;
};

type AuthContextValue = {
  customer: CustomerUser | null;
  driver: DriverProfile | null;
  /** Signed-in flags (the raw token is deliberately not exposed; use the clients). */
  customerToken: string | null;
  driverToken: string | null;
  isAuthenticated: boolean;
  ready: boolean;
  customerClient: AuthClient;
  driverClient: AuthClient;
  getValidToken: (role: Role) => Promise<string>;
  refreshToken: (role: Role) => Promise<string>;
  loginCustomer: (phone: string, pass: string) => Promise<CustomerUser>;
  registerCustomer: (data: CustomerRegisterData) => Promise<CustomerUser>;
  loginDriver: (phone: string, pass: string) => Promise<DriverProfile>;
  registerDriver: (data: DriverRegisterData) => Promise<DriverProfile>;
  updateDriverProfile: (profile: DriverProfile) => Promise<void>;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

function decodeExp(token: string): number | null {
  try {
    const part = token.split('.')[1];
    const b64 = part.replace(/-/g, '+').replace(/_/g, '/');
    const payload = JSON.parse(atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4)));
    return typeof payload.exp === 'number' ? payload.exp * 1000 : null;
  } catch {
    return null;
  }
}

function isExpiring(token: string): boolean {
  const exp = decodeExp(token);
  return exp === null || exp - Date.now() < EXPIRY_MARGIN_MS;
}

function parseStored(raw: string | null): { profile: unknown; tokens: AuthTokens } | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    // Older app versions stored { user | driver, tokens }.
    const profile = parsed.profile ?? parsed.user ?? parsed.driver;
    if (profile && parsed.tokens?.access && parsed.tokens?.refresh) return { profile, tokens: parsed.tokens };
  } catch {
    // fall through
  }
  return null;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const { role } = useRole();
  const [sessions, setSessions] = useState<Sessions>({ customer: null, driver: null });
  const [ready, setReady] = useState(false);
  const sessionsRef = useRef<Sessions>({ customer: null, driver: null });
  const refreshing = useRef<Partial<Record<Role, Promise<string>>>>({});

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [rawCust, rawDriver] = await Promise.all([
          AsyncStorage.getItem(STORAGE_KEYS.customer),
          AsyncStorage.getItem(STORAGE_KEYS.driver),
        ]);
        const next: Sessions = {
          customer: parseStored(rawCust) as Sessions['customer'],
          driver: parseStored(rawDriver) as Sessions['driver'],
        };
        if (!cancelled) {
          sessionsRef.current = next;
          setSessions(next);
        }
      } finally {
        if (!cancelled) setReady(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function saveSession<R extends Role>(r: R, session: Sessions[R]) {
    sessionsRef.current = { ...sessionsRef.current, [r]: session };
    setSessions(sessionsRef.current);
    if (session) await AsyncStorage.setItem(STORAGE_KEYS[r], JSON.stringify(session));
    else await AsyncStorage.removeItem(STORAGE_KEYS[r]);
  }

  async function doRefresh(r: Role): Promise<string> {
    let current = sessionsRef.current[r];
    if (!current) throw new SessionExpiredError();

    // Another tab (web) may already have rotated the token.
    const stored = parseStored(await AsyncStorage.getItem(STORAGE_KEYS[r]));
    if (stored && stored.tokens.refresh !== current.tokens.refresh) {
      current = { ...current, tokens: stored.tokens } as typeof current;
      await saveSession(r, current as Sessions[typeof r]);
      if (!isExpiring(stored.tokens.access)) return stored.tokens.access;
    }

    const usedRefresh = current.tokens.refresh;
    try {
      const tokens = await api.auth.refresh(usedRefresh);
      const latest = sessionsRef.current[r];
      if (!latest || latest.tokens.refresh !== usedRefresh) {
        // Logged out (or replaced) while refreshing.
        if (latest) return latest.tokens.access;
        throw new SessionExpiredError();
      }
      const next = { ...latest, tokens: { access: tokens.access, refresh: tokens.refresh || usedRefresh } };
      await saveSession(r, next as Sessions[typeof r]);
      return tokens.access;
    } catch (err) {
      if (err instanceof ApiError && (err.status === 401 || err.status === 400)) {
        if (sessionsRef.current[r]?.tokens.refresh === usedRefresh) await saveSession(r, null);
        throw new SessionExpiredError();
      }
      throw err;
    }
  }

  /** Single-flight refresh per role. */
  function refreshToken(r: Role): Promise<string> {
    const pending = refreshing.current[r];
    if (pending) return pending;
    const p = doRefresh(r).finally(() => {
      refreshing.current[r] = undefined;
    });
    refreshing.current[r] = p;
    return p;
  }

  async function getValidToken(r: Role): Promise<string> {
    const s = sessionsRef.current[r];
    if (!s) throw new SessionExpiredError();
    if (isExpiring(s.tokens.access)) return refreshToken(r);
    return s.tokens.access;
  }

  // Stable client objects (functions only read refs when called).
  const [clients] = useState(() => ({
    customer: { getToken: () => getValidToken('customer'), refresh: () => refreshToken('customer') },
    driver: { getToken: () => getValidToken('driver'), refresh: () => refreshToken('driver') },
  }));

  const loginCustomer = async (phone: string, pass: string) => {
    const res = await api.auth.customer.login({ phone, password: pass });
    await saveSession('customer', { profile: res.customer, tokens: { access: res.access, refresh: res.refresh } });
    return res.customer;
  };

  const registerCustomer = async (data: CustomerRegisterData) => {
    const res = await api.auth.customer.register(data);
    await saveSession('customer', { profile: res.customer, tokens: { access: res.access, refresh: res.refresh } });
    return res.customer;
  };

  const loginDriver = async (phone: string, pass: string) => {
    const res = await api.auth.driver.login({ phone, password: pass });
    await saveSession('driver', { profile: res.driver, tokens: { access: res.access, refresh: res.refresh } });
    return res.driver;
  };

  const registerDriver = async (data: DriverRegisterData) => {
    const res = await api.auth.driver.register(data);
    await saveSession('driver', { profile: res.driver, tokens: { access: res.access, refresh: res.refresh } });
    return res.driver;
  };

  const updateDriverProfile = async (profile: DriverProfile) => {
    const s = sessionsRef.current.driver;
    if (s) await saveSession('driver', { ...s, profile });
  };

  const logout = async () => {
    const r: Role = role === 'driver' ? 'driver' : 'customer';
    const s = sessionsRef.current[r];
    if (!s) return;
    await saveSession(r, null);
    try {
      await api.auth.logout(s.tokens.access, s.tokens.refresh);
    } catch {
      // The local session is gone either way; the refresh token expires on its own.
    }
  };

  const customerToken = sessions.customer?.tokens.access ?? null;
  const driverToken = sessions.driver?.tokens.access ?? null;
  const isAuthenticated = role === 'driver' ? Boolean(sessions.driver) : Boolean(sessions.customer);

  return (
    <AuthContext.Provider
      value={{
        customer: sessions.customer?.profile ?? null,
        driver: sessions.driver?.profile ?? null,
        customerToken,
        driverToken,
        isAuthenticated,
        ready,
        customerClient: clients.customer,
        driverClient: clients.driver,
        getValidToken,
        refreshToken,
        loginCustomer,
        registerCustomer,
        loginDriver,
        registerDriver,
        updateDriverProfile,
        logout,
      }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
