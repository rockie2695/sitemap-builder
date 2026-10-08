/**
 * `useStoredState` — `useState` that survives a page reload.
 *
 * The value is written to localStorage on every change, and read back in a mount
 * effect (never during render) so the server-rendered markup and the first client
 * render always match.
 *
 * `useStoredState` —— 可在重新整理後保留值的 `useState`。
 * 值變更時寫入 localStorage，並在掛載後的 effect 中讀回（絕不在渲染期讀取），
 * 確保伺服器端輸出的 HTML 與第一次客戶端渲染一致。
 */
import { useCallback, useEffect, useState } from 'react'

/** localStorage key prefix so the app owns its namespace. */
const PREFIX = 'sitemap-builder:'

/** localStorage prefix used by {@link useStoredState}. */
export const storageKey = (name: string): string => `${PREFIX}${name}`

/**
 * Read a persisted value, tolerating private-mode / disabled storage.
 *
 * @param name     Key without the app prefix.
 * @param fallback Returned when the key is missing or unreadable.
 */
export function readStoredValue<T>(name: string, fallback: T): T {
  try {
    const raw = window.localStorage.getItem(storageKey(name))
    if (raw === null) return fallback
    return JSON.parse(raw) as T
  } catch {
    return fallback
  }
}

/** Persist a value; failures are silently ignored (storage is optional). */
function writeStoredValue(name: string, value: unknown): void {
  try {
    window.localStorage.setItem(storageKey(name), JSON.stringify(value))
  } catch {
    // Quota exceeded or storage disabled: preferences are best-effort.
  }
}

/**
 * State backed by localStorage.
 *
 * @param name    Key without the app prefix.
 * @param initial Value used until the mount effect finds something stored.
 * @returns The value and a setter with the usual `useState` signature.
 */
export function useStoredState<T>(
  name: string,
  initial: T,
): [T, (next: T | ((previous: T) => T)) => void] {
  const [value, setValue] = useState<T>(initial)

  // Restore once on mount; never read storage during render (SSR safety).
  // This is the sanctioned "sync with an external system" effect: the value is
  // read exactly once and only here, so the rule's heuristic is disabled.
  useEffect(() => {
    // Sanctioned external-store sync: the value is read exactly once, only here.
    // eslint-disable-next-line react-hooks/set-state-in-effect -- see the comment above
    setValue(readStoredValue(name, initial))
    // `initial` is intentionally excluded: re-running on its change would clobber
    // the user's stored value with the default.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [name])

  // Persist on change. This also runs once on mount, which is harmless: it
  // rewrites the default before the restored value lands.
  useEffect(() => {
    writeStoredValue(name, value)
  }, [name, value])

  const set = useCallback((next: T | ((previous: T) => T)) => {
    setValue(next)
  }, [])

  return [value, set]
}