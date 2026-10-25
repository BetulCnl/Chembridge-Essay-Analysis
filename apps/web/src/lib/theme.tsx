import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { readStorage, writeStorage } from './storage.ts';

export type ThemeChoice = 'light' | 'dark' | 'system';

const Ctx = createContext<{ theme: ThemeChoice; setTheme: (t: ThemeChoice) => void } | null>(null);

function initial(): ThemeChoice {
  const t = readStorage('chembridge.theme');
  return t === 'light' || t === 'dark' ? t : 'system';
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<ThemeChoice>(initial);
  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'system') delete root.dataset.theme;
    else root.dataset.theme = theme;
  }, [theme]);
  const setTheme = useCallback((t: ThemeChoice) => {
    setThemeState(t);
    writeStorage('chembridge.theme', t === 'system' ? null : t);
  }, []);
  return <Ctx.Provider value={{ theme, setTheme }}>{children}</Ctx.Provider>;
}

export function useTheme() {
  const v = useContext(Ctx);
  if (!v) throw new Error('useTheme outside ThemeProvider');
  return v;
}
