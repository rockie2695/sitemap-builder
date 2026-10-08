/**
 * Unit tests for `lib/i18n`: dictionaries, interpolation, log formatting and
 * locale detection.
 *
 * Dictionary completeness is enforced at compile time (each dictionary is typed
 * `Record<UiKey, string>`); these tests cover the runtime behaviour.
 *
 * `lib/i18n` 的單元測試：字典、插值、日誌格式化與語系偵測。
 * 字典完整性由型別（`Record<UiKey, string>`）在編譯期保證，這裡測執行期行為。
 */
import { describe, expect, it } from 'vitest'

import {
  DICTIONARIES,
  LOG_DICTIONARIES,
  LOCALES,
  detectLocale,
  formatLogMessage,
  interpolate,
  isLocale,
  translate,
  translateError,
} from '@/lib/i18n'

describe('dictionaries / 字典', () => {
  it('covers every locale / 涵蓋所有語系', () => {
    expect(Object.keys(DICTIONARIES).sort()).toEqual([...LOCALES].sort())
    expect(Object.keys(LOG_DICTIONARIES).sort()).toEqual([...LOCALES].sort())
  })

  it('has the same UI keys in every locale / 各語系的 UI 鍵一致', () => {
    const reference = Object.keys(DICTIONARIES.en).sort()
    for (const locale of LOCALES) {
      expect(Object.keys(DICTIONARIES[locale]).sort()).toEqual(reference)
    }
  })

  it('has the same log keys in every locale / 各語系的日誌鍵一致', () => {
    const reference = Object.keys(LOG_DICTIONARIES.en).sort()
    for (const locale of LOCALES) {
      expect(Object.keys(LOG_DICTIONARIES[locale]).sort()).toEqual(reference)
    }
  })

  it('has no empty strings / 沒有空字串', () => {
    for (const locale of LOCALES) {
      for (const [key, value] of Object.entries(DICTIONARIES[locale])) {
        expect(value.trim(), `${locale}:${key}`).not.toBe('')
      }
    }
  })
})

describe('interpolate / 插值', () => {
  it('replaces named placeholders / 取代具名佔位符', () => {
    expect(interpolate('{count} of {total} done', { count: 3, total: 5 })).toBe('3 of 5 done')
  })

  it('leaves unknown placeholders untouched / 未知佔位符保持原樣', () => {
    expect(interpolate('{a} and {b}', { a: 'x' })).toBe('x and {b}')
  })

  it('returns the template without params / 無參數時回傳原字串', () => {
    expect(interpolate('plain {x}')).toBe('plain {x}')
  })
})

describe('translate / 翻譯', () => {
  it('translates per locale / 依語系翻譯', () => {
    expect(translate('en', 'control.start')).toBe('Start')
    expect(translate('zh-TW', 'control.start')).toBe('開始抓取')
    expect(translate('zh-CN', 'control.start')).toBe('开始抓取')
  })

  it('interpolates parameters / 支援參數插值', () => {
    expect(translate('en', 'export.count', { count: 12 })).toBe('12 to export')
    expect(translate('zh-TW', 'export.count', { count: 12 })).toBe('將匯出 12 條')
  })

  it('log templates interpolate too / 日誌模板同樣支援插值', () => {
    expect(translate('en', 'job.eta', { duration: '3m 20s' })).toBe('ETA ~3m 20s')
  })
})

describe('formatLogMessage / 日誌格式化', () => {
  it('renders a plain entry / 一般條目', () => {
    expect(formatLogMessage('en', { key: 'log.task.start', params: { url: 'https://x.test/' } })).toBe(
      'Task started: https://x.test/',
    )
  })

  it('decorates the page title with a separator / 頁面標題加上分隔符', () => {
    expect(
      formatLogMessage('en', {
        key: 'log.page.ok',
        params: { http: 'HTTP 200', title: 'Home', links: 3, seconds: '1.2' },
      }),
    ).toBe('✓ HTTP 200 · Home · 3 link(s) · 1.2s')
  })

  it('omits the separator when there is no title / 無標題時不加分隔符', () => {
    expect(
      formatLogMessage('en', {
        key: 'log.page.ok',
        params: { http: 'HTTP 200', title: '', links: 0, seconds: '0.4' },
      }),
    ).toBe('✓ HTTP 200 · 0 link(s) · 0.4s')
  })

  it('translates the retry line / 重試行翻譯', () => {
    expect(
      formatLogMessage('zh-CN', {
        key: 'log.page.retry',
        params: { attempt: 1, max: 2, url: 'https://x.test/a' },
      }),
    ).toBe('⟳ 重试 1/2：https://x.test/a')
  })

  it('renders legacy entries verbatim / 舊版日誌原樣呈現', () => {
    expect(formatLogMessage('en', { key: 'log.legacy', params: { message: '舊訊息' } })).toBe('舊訊息')
  })

  it('falls back instead of throwing on an unknown key / 未知鍵不拋錯', () => {
    // A snapshot from a future/older version may carry a key this build lacks.
    expect(
      formatLogMessage('en', {
        key: 'log.unknown' as never,
        params: { message: 'carried text' },
      }),
    ).toBe('carried text')
    expect(formatLogMessage('en', { key: 'log.unknown' as never })).toBe('log.unknown')
  })
})

describe('translateError / 錯誤碼翻譯', () => {
  it('translates a known server code / 已知錯誤碼翻譯', () => {
    expect(translateError('en', 'error.ssrf', { host: 'localhost' }, 'raw')).toContain('localhost')
    expect(translateError('zh-TW', 'error.ssrf', { host: 'localhost' }, 'raw')).toContain('SSRF')
  })

  it('falls back to the raw message / 未知錯誤碼回退原文', () => {
    expect(translateError('en', 'nope', undefined, 'raw message')).toBe('raw message')
    expect(translateError('en', undefined, undefined, 'raw message')).toBe('raw message')
  })
})

describe('detectLocale / 語系偵測', () => {
  it('validates locale strings / 驗證語系字串', () => {
    expect(isLocale('en')).toBe(true)
    expect(isLocale('zh-TW')).toBe(true)
    expect(isLocale('fr')).toBe(false)
    expect(isLocale(undefined)).toBe(false)
  })

  it('maps zh variants to the right script / 區分正簡體', () => {
    const original = Object.getOwnPropertyDescriptor(window.navigator, 'languages')
    const setLanguages = (languages: string[]) => {
      Object.defineProperty(window.navigator, 'languages', {
        configurable: true,
        get: () => languages,
      })
    }

    setLanguages(['zh-TW', 'zh'])
    expect(detectLocale()).toBe('zh-TW')
    setLanguages(['zh-Hant'])
    expect(detectLocale()).toBe('zh-TW')
    setLanguages(['zh-CN', 'en'])
    expect(detectLocale()).toBe('zh-CN')
    setLanguages(['en-US', 'zh'])
    expect(detectLocale()).toBe('en')
    setLanguages(['fr-FR'])
    expect(detectLocale()).toBe('en')

    if (original) Object.defineProperty(window.navigator, 'languages', original)
  })
})