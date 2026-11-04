import AsyncStorage from '@react-native-async-storage/async-storage';
import type { ReactNode } from 'react';
import React, { createContext, useContext, useEffect, useState } from 'react';

import {
  api,
  type AuthTokens,
  type CustomerUser,
  type DriverProfile,
} from './api';
import { useRole } from './role';

const CUSTOMER_STORAGE_KEY = '@goxe/auth_customer';
const DRIVER_STORAGE_KEY = '@goxe/auth_driver';

type CustomerSession = {
  user: CustomerUser;
  tokens: AuthTokens;
};

type DriverSession = {
  driver: DriverProfile;
  tokens: AuthTokens;
};

type AuthContextValue = {
  customer: CustomerUser | null;
  driver: DriverProfile | null;
  activeProfile: CustomerUser | DriverProfile | null;
  token: string | null;
  customerToken: string | null;
  driverToken: string | null;
  isAuthenticated: boolean;
  ready: boolean;
  loginCustomer: (phone: string, pass: string) => Promise<CustomerUser>;
  registerCustomer: (data: {
    phone: string;
    full_name: string;
    email?: string;
    password: string;
    password_confirm: string;
  }) => Promise<CustomerUser>;
  loginDriver: (phone: string, pass: string) => Promise<DriverProfile>;
  registerDriver: (data: {
    phone: string;
    full_name: string;
    license_number: string;
    vehicle_plate: string;
    vehicle_type: 'bike' | 'car4' | 'car7';
    vehicle_name?: string;
    password: string;
    password_confirm: string;
  }) => Promise<DriverProfile>;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const { role } = useRole();
  const [customerSession, setCustomerSession] = useState<CustomerSession | null>(null);
  const [driverSession, setDriverSession] = useState<DriverSession | null>(null);
  const [ready, setReady] = useState(false);

  // Load saved sessions on mount
  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const [rawCust, rawDriver] = await Promise.all([
          AsyncStorage.getItem(CUSTOMER_STORAGE_KEY),
          AsyncStorage.getItem(DRIVER_STORAGE_KEY),
        ]);

        if (rawCust && !cancelled) {
          try {
            const parsed = JSON.parse(rawCust) as CustomerSession;
            setCustomerSession(parsed);
          } catch {
            await AsyncStorage.removeItem(CUSTOMER_STORAGE_KEY);
          }
        }

        if (rawDriver && !cancelled) {
          try {
            const parsed = JSON.parse(rawDriver) as DriverSession;
            setDriverSession(parsed);
          } catch {
            await AsyncStorage.removeItem(DRIVER_STORAGE_KEY);
          }
        }
      } finally {
        if (!cancelled) setReady(true);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const loginCustomer = async (phone: string, pass: string) => {
    const res = await api.auth.customer.login({ phone, password: pass });
    const session: CustomerSession = {
      user: res.customer,
      tokens: { access: res.access, refresh: res.refresh },
    };
    setCustomerSession(session);
    await AsyncStorage.setItem(CUSTOMER_STORAGE_KEY, JSON.stringify(session));
    return res.customer;
  };

  const registerCustomer = async (data: {
    phone: string;
    full_name: string;
    email?: string;
    password: string;
    password_confirm: string;
  }) => {
    const res = await api.auth.customer.register(data);
    const session: CustomerSession = {
      user: res.customer,
      tokens: { access: res.access, refresh: res.refresh },
    };
    setCustomerSession(session);
    await AsyncStorage.setItem(CUSTOMER_STORAGE_KEY, JSON.stringify(session));
    return res.customer;
  };

  const loginDriver = async (phone: string, pass: string) => {
    const res = await api.auth.driver.login({ phone, password: pass });
    const session: DriverSession = {
      driver: res.driver,
      tokens: { access: res.access, refresh: res.refresh },
    };
    setDriverSession(session);
    await AsyncStorage.setItem(DRIVER_STORAGE_KEY, JSON.stringify(session));
    return res.driver;
  };

  const registerDriver = async (data: {
    phone: string;
    full_name: string;
    license_number: string;
    vehicle_plate: string;
    vehicle_type: 'bike' | 'car4' | 'car7';
    vehicle_name?: string;
    password: string;
    password_confirm: string;
  }) => {
    const res = await api.auth.driver.register(data);
    const session: DriverSession = {
      driver: res.driver,
      tokens: { access: res.access, refresh: res.refresh },
    };
    setDriverSession(session);
    await AsyncStorage.setItem(DRIVER_STORAGE_KEY, JSON.stringify(session));
    return res.driver;
  };

  const logout = async () => {
    if (role === 'driver') {
      if (driverSession) {
        try {
          await api.auth.logout(driverSession.tokens.access, driverSession.tokens.refresh);
        } catch {
          // Ignore network errors during logout
        }
        await AsyncStorage.removeItem(DRIVER_STORAGE_KEY);
        setDriverSession(null);
      }
    } else {
      if (customerSession) {
        try {
          await api.auth.logout(customerSession.tokens.access, customerSession.tokens.refresh);
        } catch {
          // Ignore network errors during logout
        }
        await AsyncStorage.removeItem(CUSTOMER_STORAGE_KEY);
        setCustomerSession(null);
      }
    }
  };

  const isDriver = role === 'driver';
  const activeProfile = isDriver ? driverSession?.driver ?? null : customerSession?.user ?? null;
  const token = isDriver ? driverSession?.tokens.access ?? null : customerSession?.tokens.access ?? null;
  const isAuthenticated = Boolean(activeProfile && token);

  const customerToken = customerSession?.tokens.access ?? null;
  const driverToken = driverSession?.tokens.access ?? null;

  return (
    <AuthContext.Provider
      value={{
        customer: customerSession?.user ?? null,
        driver: driverSession?.driver ?? null,
        activeProfile,
        token,
        customerToken,
        driverToken,
        isAuthenticated,
        ready,
        loginCustomer,
        registerCustomer,
        loginDriver,
        registerDriver,
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

