import { type ReactNode, useCallback, useEffect, useMemo, useState } from 'react';
import { App as AntdApp, ConfigProvider, type ThemeConfig, theme as antdTheme } from 'antd';
import ptBR from 'antd/locale/pt_BR';
import { FONT_STACKS, RADII, SEMANTIC_HEX } from '../theme/tokens';
import { ThemeContext, type ThemeContextValue } from './themeContextObject';

const STORAGE_KEY = 'ps_theme';

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [isDark, setIsDark] = useState<boolean>(() => {
    try {
      return localStorage.getItem(STORAGE_KEY) === 'dark';
    } catch {
      return false;
    }
  });

  useEffect(() => {
    const mode = isDark ? 'dark' : 'light';
    document.documentElement.setAttribute('data-theme', mode);
    try {
      localStorage.setItem(STORAGE_KEY, mode);
    } catch {
      // Ignora caso armazenamento local esteja indisponível
    }
  }, [isDark]);

  const toggleTheme = useCallback(() => {
    setIsDark((prev) => !prev);
  }, []);

  const setThemeMode = useCallback((mode: 'dark' | 'light') => {
    setIsDark(mode === 'dark');
  }, []);

  const contextValue = useMemo<ThemeContextValue>(
    () => ({
      isDark,
      toggleTheme,
      setThemeMode,
    }),
    [isDark, toggleTheme, setThemeMode]
  );

  const antdThemeConfig = useMemo<ThemeConfig>(
    () => ({
      algorithm: isDark ? antdTheme.darkAlgorithm : antdTheme.defaultAlgorithm,
      token: {
        colorPrimary: SEMANTIC_HEX.brand,
        colorSuccess: SEMANTIC_HEX.operational,
        colorWarning: SEMANTIC_HEX.warning,
        colorError: SEMANTIC_HEX.critical,
        borderRadius: RADII.md,
        fontFamily: FONT_STACKS.sans,
        fontFamilyCode: FONT_STACKS.mono,
        colorBgLayout: isDark ? '#0b1120' : '#f8fafc',
        colorBgContainer: isDark ? '#151f32' : '#ffffff',
        colorBgElevated: isDark ? '#1e293b' : '#ffffff',
        colorBorderSecondary: isDark ? '#26334d' : '#e2e8f0',
        colorBorder: isDark ? '#26334d' : '#cbd5e1',
      },
      components: {
        Card: {
          borderRadiusLG: RADII.card,
          colorBorderSecondary: isDark ? '#26334d' : '#e2e8f0',
        },
        Table: {
          headerBg: isDark ? '#0f172a' : '#f8fafc',
          borderColor: isDark ? '#26334d' : '#e2e8f0',
        },
      },
    }),
    [isDark]
  );

  return (
    <ThemeContext value={contextValue}>
      <ConfigProvider locale={ptBR} theme={antdThemeConfig}>
        <AntdApp>{children}</AntdApp>
      </ConfigProvider>
    </ThemeContext>
  );
}
