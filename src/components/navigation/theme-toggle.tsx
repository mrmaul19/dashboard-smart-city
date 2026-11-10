'use client';

import { useEffect } from 'react';
import { Moon, Sun } from 'lucide-react';
import { IconButton } from '@/components/ui/icon-button';
import { useDashboardStore } from '@/stores/dashboard-store';

const STORAGE_KEY = 'scdt:theme';

/**
 * Dark/light theme control.
 *
 * The theme is applied by setting `data-theme` on <html>, which swaps the CSS
 * token values in `globals.css`. The store's default is `dark` so that the
 * server-rendered markup and the first client render agree; a stored preference
 * is read after mount, which avoids a hydration mismatch at the cost of one
 * frame in light mode.
 */
export function ThemeToggle() {
  const theme = useDashboardStore((s) => s.theme);
  const setTheme = useDashboardStore((s) => s.setTheme);
  const toggleTheme = useDashboardStore((s) => s.toggleTheme);

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(STORAGE_KEY);
      if (stored === 'light' || stored === 'dark') setTheme(stored);
    } catch {
      // Private mode or blocked storage: keep the default theme.
    }
  }, [setTheme]);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    try {
      window.localStorage.setItem(STORAGE_KEY, theme);
    } catch {
      // Ignore: the theme still applies for this session.
    }
  }, [theme]);

  return (
    <IconButton
      icon={theme === 'dark' ? Sun : Moon}
      label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
      onClick={toggleTheme}
    />
  );
}
