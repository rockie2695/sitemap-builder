/**
 * `useTheme` — light/dark switching.
 *
 * shadcn/ui drives dark mode from a `.dark` class on `<html>`, so all this hook
 * has to do is toggle that class, remember the choice and (optionally) follow the
 * OS preference on first visit.
 *
 * `useTheme` —— 淺色／深色切換。
 * shadcn/ui 的深色模式由 `<html>` 上的 `.dark` 類別驅動，
 * 因此這個 hook 只需切換該類別、記住使用者選擇，並在首次造訪時沿用系統偏好。
 */
import { useCallback, useEffect } from 'react'

import { useStoredState } from './useStoredState'

/** Supported colour schemes. */
export type Theme = 'light' | 'dark'

/** localStorage key name (prefixed automatically). */
const THEME_KEY = 'theme'

/** Whether the OS currently prefers a dark colour scheme. */
function prefersDark(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-color-scheme: dark)').matches
  )
}

/** Reflect the theme onto `<html>` so Tailwind's `dark:` variants kick in. */
function applyTheme(theme: Theme): void {
  if (typeof document === 'undefined') return
  document.documentElement.classList.toggle('dark', theme === 'dark')
  document.documentElement.style.colorScheme = theme
}

/** What {@link useTheme} returns. */
export interface UseThemeResult {
  theme: Theme
  setTheme: (theme: Theme) => void
  toggleTheme: () => void
  isDark: boolean
}

/**
 * Current colour scheme plus setters.
 *
 * The stored preference wins; when nothing is stored we follow the OS.
 */
export function useTheme(): UseThemeResult {
  const [theme, setTheme] = useStoredState<Theme>(THEME_KEY, 'light')

  // Adopt the OS preference on first visit (no stored value yet).
  useEffect(() => {
    const stored = window.localStorage.getItem('sitemap-builder:theme')
    if (!stored && prefersDark()) setTheme('dark')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    applyTheme(theme)
  }, [theme])

  const toggleTheme = useCallback(() => {
    setTheme(theme === 'dark' ? 'light' : 'dark')
  }, [theme, setTheme])

  return { theme, setTheme, toggleTheme, isDark: theme === 'dark' }
}