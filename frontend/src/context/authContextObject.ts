import { createContext, useContext } from 'react';
import type { User } from '../types/models';

export interface AuthContextValue {
  user: User | null;
  initializing: boolean;
  isAuthenticated: boolean;
  isGlobalAdmin: boolean;
  isCompanyAdmin: boolean;
  isViewer: boolean;
  canWriteOperations: boolean;
  signIn: (email: string, password: string) => Promise<User>;
  signOut: () => Promise<void>;
  refreshUser: () => Promise<User>;
  saveProfileName: (name: string) => Promise<User>;
}

export const AuthContext = createContext<AuthContextValue | null>(null);

export const useAuth = (): AuthContextValue => {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth deve ser utilizado dentro de um AuthProvider');
  }
  return ctx;
};
