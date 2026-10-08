/**
 * Test helpers shared by the component suites.
 *
 * `renderWithI18n` wraps the subject in `LocaleProvider`, which every dashboard
 * component now requires (they read their copy from `useI18n()`). In jsdom the
 * browser language is `en-US`, so the rendered text is English unless a test sets a
 * stored locale explicitly.
 *
 * 元件測試共用的輔助工具。`renderWithI18n` 會把受測元件包進 `LocaleProvider`
 * （所有儀表板元件都改由 `useI18n()` 取得文案）。jsdom 的瀏覽器語言是 `en-US`，
 * 因此除非測試明確設定語系，呈現文字為英文。
 */
import { render } from '@testing-library/react'
import type { ReactElement, ReactNode } from 'react'

import { LocaleProvider } from '@/components/providers/LocaleProvider'

/** Wrapper for `rerender` calls, which cannot reuse `renderWithI18n`. */
export function I18nWrapper({ children }: { children: ReactNode }) {
  return <LocaleProvider>{children}</LocaleProvider>
}

/** Render `ui` inside the locale provider. */
export function renderWithI18n(ui: ReactElement) {
  return render(<I18nWrapper>{ui}</I18nWrapper>)
}

export { act, fireEvent, screen, waitFor, within } from '@testing-library/react'
export { userEvent } from '@testing-library/user-event'