/**
 * Locale provider + `useI18n()` hook.
 *
 * The first render (server and hydration) always uses `FALLBACK_LOCALE`; a mount
 * effect then adopts the stored preference or the browser language. That ordering
 * is deliberate — reading `navigator` during render would break hydration.
 *
 * 語系 Provider 與 `useI18n()`。第一次渲染（伺服器與水合）一律使用
 * `FALLBACK_LOCALE`，掛載後的 effect 才採用已儲存的偏好或瀏覽器語言——
 * 在渲染期讀取 `navigator` 會造成水合不一致。
 */
'use client'

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'

import { useStoredState } from '@/hooks/useStoredState'
import {
  FALLBACK_LOCALE,
  HTML_LANG,
  detectLocale,
  formatLogMessage,
  isLocale,
  translate,
  translateError,
  type Locale,
  type LogMessageKey,
  type MessageParams,
  type UiKey,
} from '@/lib/i18n'

/** Everything `useI18n()` exposes. */
export interface I18nValue {
  /** Active locale. */
  locale: Locale
  /** Persist and apply a locale. */
  setLocale: (locale: Locale) => void
  /** Translate a UI key. */
  t: (key: UiKey, params?: MessageParams) => string
  /** Translate a structured engine log entry. */
  tLog: (entry: { key: LogMessageKey; params?: MessageParams }) => string
  /** Translate a server error code, falling back to the raw message. */
  tError: (code: string | undefined, params: MessageParams | undefined, raw: string) => string
}

const I18nContext = createContext<I18nValue | null>(null)

/** Provide locale state to the whole tree. */
export function LocaleProvider({ children }: { children: ReactNode }) {
  // Stored preference ('' = never chosen) and the browser-detected fallback.
  const [stored, setStored] = useStoredState<Locale | ''>('locale', '')
  const [detected, setDetected] = useState<Locale>(FALLBACK_LOCALE)

  // Adopt the browser language after mount only: reading `navigator` during render
  // would make the client's first render disagree with the server HTML.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- see the comment above
    setDetected(detectLocale())
  }, [])

  const locale: Locale = isLocale(stored) ? stored : detected

  // Reflect the locale onto the document so a11y tools and the browser agree.
  useEffect(() => {
    if (typeof document === 'undefined') return
    document.documentElement.lang = HTML_LANG[locale]
  }, [locale])

  const setLocale = useCallback((next: Locale) => setStored(next), [setStored])

  const t = useCallback(
    (key: UiKey, params?: MessageParams) => translate(locale, key, params),
    [locale],
  )

  const tLog = useCallback(
    (entry: { key: LogMessageKey; params?: MessageParams }) => formatLogMessage(locale, entry),
    [locale],
  )

  const tError = useCallback(
    (code: string | undefined, params: MessageParams | undefined, raw: string) =>
      translateError(locale, code, params, raw),
    [locale],
  )

  const value = useMemo<I18nValue>(
    () => ({ locale, setLocale, t, tLog, tError }),
    [locale, setLocale, t, tLog, tError],
  )

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>
}

/**
 * Access translations.
 *
 * @throws When called outside {@link LocaleProvider} — a programming error worth
 *         failing loudly instead of silently rendering English.
 */
export function useI18n(): I18nValue {
  const value = useContext(I18nContext)
  if (!value) throw new Error('useI18n() must be used inside <LocaleProvider>')
  return value
}