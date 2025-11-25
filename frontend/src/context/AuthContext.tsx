import { type ReactNode, useCallback, useEffect, useMemo, useState } from 'react';
import {
  clearStoredSession,
  getCurrentUser,
  login as apiLogin,
  logout as apiLogout,
  updateProfile as apiUpdateProfile,
} from '../api';
import type { User, UserRole } from '../types/models';
import { queryClient } from '../query/queryClient';
import { AuthContext, type AuthContextValue } from './authContextObject';

const isUserRole = (value: unknown): value is UserRole =>
  value === 'global_admin' || value === 'company_admin' || value === 'company_viewer';

const isStoredUser = (value: unknown): value is User => {
  if (typeof value !== 'object' || value === null) return false;
  return (
    'id' in value &&
    typeof value.id === 'string' &&
    'name' in value &&
    typeof value.name === 'string' &&
    'email' in value &&
    typeof value.email === 'string' &&
    'role' in value &&
    isUserRole(value.role)
  );
};

const readInitialUser = (): User | null => {
  try {
    const token = localStorage.getItem('accessToken');
    const rawUser = localStorage.getItem('user');
    if (!token || !rawUser) return null;
    const parsed: unknown = JSON.parse(rawUser);
    return isStoredUser(parsed) ? parsed : null;
  } catch {
    return null;
  }
};

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(readInitialUser);
  const [initializing, setInitializing] = useState<boolean>(() =>
    Boolean(localStorage.getItem('accessToken'))
  );

  useEffect(() => {
    let active = true;
    const token = localStorage.getItem('accessToken');
    if (!token) {
      return undefined;
    }

    void (async () => {
      try {
        const freshUser = await getCurrentUser();
        if (active) {
          setUser(freshUser);
        }
      } catch {
        if (active) {
          clearStoredSession();
          setUser(null);
        }
      } finally {
        if (active) {
          setInitializing(false);
        }
      }
    })();

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    const onSessionExpired = () => {
      queryClient.clear();
      setUser(null);
    };
    window.addEventListener('auth:session-expired', onSessionExpired);
    return () => {
      window.removeEventListener('auth:session-expired', onSessionExpired);
    };
  }, []);

  const signIn = useCallback(async (email: string, password: string): Promise<User> => {
    const loggedUser = await apiLogin(email, password);
    queryClient.clear();
    setUser(loggedUser);
    return loggedUser;
  }, []);

  const signOut = useCallback(async (): Promise<void> => {
    await apiLogout();
    queryClient.clear();
    setUser(null);
  }, []);

  const refreshUser = useCallback(async (): Promise<User> => {
    const freshUser = await getCurrentUser();
    setUser(freshUser);
    return freshUser;
  }, []);

  const saveProfileName = useCallback(async (name: string): Promise<User> => {
    const updatedUser = await apiUpdateProfile(name);
    setUser(updatedUser);
    return updatedUser;
  }, []);

  const value = useMemo<AuthContextValue>(() => {
    const role = user?.role || null;
    const isGlobalAdmin = role === 'global_admin';
    const isCompanyAdmin = role === 'company_admin';
    const isViewer = role === 'company_viewer';
    const canWriteOperations = isGlobalAdmin || isCompanyAdmin;

    return {
      user,
      initializing,
      isAuthenticated: Boolean(user),
      isGlobalAdmin,
      isCompanyAdmin,
      isViewer,
      canWriteOperations,
      signIn,
      signOut,
      refreshUser,
      saveProfileName,
    };
  }, [user, initializing, signIn, signOut, refreshUser, saveProfileName]);

  return <AuthContext value={value}>{children}</AuthContext>;
}
