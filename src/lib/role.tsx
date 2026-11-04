import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

export type Role = 'customer' | 'driver';

const STORAGE_KEY = '@goxe/role';

type RoleContextValue = {
  role: Role | null;
  ready: boolean;
  setRole: (role: Role | null) => Promise<void>;
};

const RoleContext = createContext<RoleContextValue | null>(null);

/** Holds which side of the app (customer or driver) the user picked. */
export function RoleProvider({ children }: { children: ReactNode }) {
  const [role, setRoleState] = useState<Role | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY)
      .then((value) => {
        if (value === 'customer' || value === 'driver') setRoleState(value);
      })
      .finally(() => setReady(true));
  }, []);

  const setRole = async (next: Role | null) => {
    setRoleState(next);
    if (next) await AsyncStorage.setItem(STORAGE_KEY, next);
    else await AsyncStorage.removeItem(STORAGE_KEY);
  };

  return <RoleContext.Provider value={{ role, ready, setRole }}>{children}</RoleContext.Provider>;
}

export function useRole() {
  const ctx = useContext(RoleContext);
  if (!ctx) throw new Error('useRole must be used inside RoleProvider');
  return ctx;
}
