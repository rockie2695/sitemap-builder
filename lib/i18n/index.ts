/**
 * i18n runtime: dictionary lookup, interpolation and locale detection.
 *
 * 語系執行階段：字典查詢、字串插值與語系偵測。
 */
import { en, enLog } from './en'
import { zhCN, zhCNLog } from './zh-CN'
import { zhTW, zhTWLog } from './zh-TW'
import { LOCALES, type Dictionary, type Locale, type LogDictionary, type LogMessageKey, type MessageParams, type UiKey } from './types'

export { HTML_LANG, LOCALE_LABEL, LOCALES } from './types'
export type { Dictionary, Locale, LogDictionary, LogMessageKey, MessageParams, UiKey } from './types'

/** UI dictionaries by locale. */
export const DICTIONARIES: Record<Locale, Dictionary> = {
  en,
  'zh-TW': zhTW,
  'zh-CN': zhCN,
}

/** Log-message dictionaries by locale. */
export const LOG_DICTIONARIES: Record<Locale, LogDictionary> = {
  en: enLog,
  'zh-TW': zhTWLog,
  'zh-CN': zhCNLog,
}

/** Fallback locale when the browser language matches nothing. */
export const FALLBACK_LOCALE: Locale = 'en'

/** Type guard for locale strings from storage or the DOM. */
export function isLocale(value: unknown): value is Locale {
  return typeof value === 'string' && (LOCALES as readonly string[]).includes(value)
}

/**
 * Replace `{name}` placeholders with their values.
 *
 * @param template Message containing optional `{name}` placeholders.
 * @param params   Values to substitute; unknown placeholders are left untouched.
 */
export function interpolate(template: string, params?: MessageParams): string {
  if (typeof template !== 'string') return ''
  if (!params) return template
  return template.replace(/\{(\w+)\}/g, (match, name: string) =>
    name in params ? String(params[name]) : match,
  )
}

/**
 * Translate a UI key.
 *
 * @param locale Target locale.
 * @param key    UI key.
 * @param params Optional interpolation values.
 */
export function translate(locale: Locale, key: UiKey, params?: MessageParams): string {
  return interpolate((DICTIONARIES[locale] ?? DICTIONARIES[FALLBACK_LOCALE])[key], params)
}

/**
 * Translate a structured engine log entry into display text.
 *
 * The `title` parameter is decoration rather than content, so the ` · ` separator
 * is added here instead of living in every dictionary.
 *
 * @param locale Target locale.
 * @param entry  Log message key plus its parameters.
 */
export function formatLogMessage(
  locale: Locale,
  entry: { key: LogMessageKey; params?: MessageParams },
): string {
  const params: MessageParams = { ...entry.params }

  /** Keys that decorate a page title onto the message. */
  const titled: LogMessageKey[] = ['log.page.ok', 'log.page.okWarn', 'log.page.httpError']
  if (titled.includes(entry.key)) {
    params.title = params.title ? ` · ${params.title}` : ''
  }

  const dictionary = LOG_DICTIONARIES[locale] ?? LOG_DICTIONARIES[FALLBACK_LOCALE]
  const template = dictionary[entry.key]

  // Defensive: snapshots written by an older version can carry keys this build does
  // not know. Fall back to the carried text rather than crashing the log panel.
  if (typeof template !== 'string') {
    return typeof params.message === 'string' ? params.message : String(entry.key)
  }

  return interpolate(template, params)
}

/**
 * Translate a server error code, falling back to the raw message.
 *
 * @param locale Target locale.
 * @param code   `errorCode` returned by `/api/crawl` (may be undefined).
 * @param params Interpolation values (e.g. `{ host }`).
 * @param raw    Verbatim server/browser message used when the code is unknown.
 */
export function translateError(
  locale: Locale,
  code: string | undefined,
  params: MessageParams | undefined,
  raw: string,
): string {
  if (code && code in DICTIONARIES[locale]) {
    return translate(locale, code as UiKey, params)
  }
  return raw
}

/**
 * Best-effort locale from the browser's preferred languages.
 *
 * `zh-Hant` / `zh-TW` / `zh-HK` map to Traditional, other `zh-*` to Simplified.
 */
export function detectLocale(): Locale {
  if (typeof navigator === 'undefined') return FALLBACK_LOCALE

  const candidates =
    navigator.languages && navigator.languages.length > 0
      ? navigator.languages
      : [navigator.language]

  for (const tag of candidates) {
    const lower = String(tag).toLowerCase()
    if (lower.startsWith('zh')) {
      return /hant|tw|hk|mo/.test(lower) ? 'zh-TW' : 'zh-CN'
    }
    if (lower.startsWith('en')) return 'en'
  }
  return FALLBACK_LOCALE
}