import { useLayoutEffect, useState } from "react";

export type ThemeMode = "light" | "dark";

export const THEME_STORAGE_KEY = "mauth-studio.theme.v1";

export function normalizeThemeMode(value: unknown): ThemeMode | null {
  return value === "light" || value === "dark" ? value : null;
}

export function resolvedInitialThemeMode(storedTheme: unknown, prefersDark: boolean): ThemeMode {
  return normalizeThemeMode(storedTheme) ?? (prefersDark ? "dark" : "light");
}

export function nextThemeMode(theme: ThemeMode): ThemeMode {
  return theme === "dark" ? "light" : "dark";
}

function loadInitialTheme(): ThemeMode {
  if (typeof window === "undefined") return "light";

  return resolvedInitialThemeMode(
    window.localStorage.getItem(THEME_STORAGE_KEY),
    window.matchMedia?.("(prefers-color-scheme: dark)").matches,
  );
}

function applyTheme(theme: ThemeMode) {
  if (typeof document === "undefined") return;

  document.documentElement.classList.toggle("dark", theme === "dark");
  document.documentElement.style.colorScheme = theme;
}

export function useThemeController() {
  const [theme, setTheme] = useState<ThemeMode>(loadInitialTheme);
  const darkMode = theme === "dark";

  useLayoutEffect(() => {
    applyTheme(theme);
    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, theme);
    } catch {
      // Theme still applies for the current session if browser storage is unavailable.
    }
  }, [theme]);

  return {
    theme,
    darkMode,
    toggleTheme: () => setTheme(nextThemeMode),
  };
}
