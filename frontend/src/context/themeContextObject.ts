import { createContext, useContext } from 'react';

export interface ThemeContextValue {
  isDark: boolean;
  toggleTheme: () => void;
  setThemeMode: (mode: 'dark' | 'light') => void;
}

export const ThemeContext = createContext<ThemeContextValue>({
  isDark: false,
  toggleTheme: () => {},
  setThemeMode: () => {},
});

export const useTheme = (): ThemeContextValue => useContext(ThemeContext);
