/**
 * Unit tests for `lib/sitemap/url-display.ts`.
 *
 * `lib/sitemap/url-display.ts` 的單元測試。
 */
import { describe, expect, it } from 'vitest'

import { displayUrl, parseHostOverride, toReadableUrl } from '@/lib/sitemap/url-display'
import type { UrlRecord } from '@/types/crawl'

/** Minimal record; only the URL fields matter here. */
function record(url: string, finalUrl: string | null = null): Pick<UrlRecord, 'url' | 'finalUrl'> {
  return { url, finalUrl }
}

/** All switches off. */
const PLAIN = { readableUrls: false, useFinalUrl: false, hostOverride: '' }

describe('parseHostOverride / 主機替換解析', () => {
  it('normalizes a valid origin / 正規化合法 origin', () => {
    expect(parseHostOverride('https://www.example.com')).toBe('https://www.example.com')
    expect(parseHostOverride('  https://www.example.com/  ')).toBe('https://www.example.com')
    expect(parseHostOverride('http://localhost:3000')).toBe('http://localhost:3000')
  })

  it('rejects empty and invalid values / 拒絕空值與非法值', () => {
    expect(parseHostOverride('')).toBeNull()
    expect(parseHostOverride('   ')).toBeNull()
    expect(parseHostOverride('not a url')).toBeNull()
    expect(parseHostOverride('ftp://example.com')).toBeNull()
  })
})

describe('toReadableUrl / 可讀 URL', () => {
  it('decodes path and query / 解碼路徑與查詢', () => {
    expect(toReadableUrl('https://example.com/%E4%B8%AD%E6%96%87/%E9%A1%B5?q=%E6%B5%8B')).toBe(
      'https://example.com/中文/页?q=测',
    )
  })

  it('keeps reserved characters encoded / 保留字元維持編碼', () => {
    // decodeURI leaves `%26` (an encoded `&`) alone, which keeps the URL valid.
    expect(toReadableUrl('https://example.com/a%2Fb')).toBe('https://example.com/a%2Fb')
  })

  it('returns the input for unparseable URLs / 無法解析時回傳原文', () => {
    expect(toReadableUrl('::::')).toBe('::::')
  })
})

describe('displayUrl / 匯出 URL 呈現', () => {
  it('passes through by default / 預設原樣輸出', () => {
    expect(displayUrl(record('https://example.com/a'), PLAIN)).toBe('https://example.com/a')
  })

  it('prefers the final URL when asked / 開啟時使用最終位址', () => {
    expect(
      displayUrl(record('https://example.com/old', 'https://example.com/new'), {
        ...PLAIN,
        useFinalUrl: true,
      }),
    ).toBe('https://example.com/new')
  })

  it('ignores the final URL when the switch is off / 關閉時忽略最終位址', () => {
    expect(
      displayUrl(record('https://example.com/old', 'https://example.com/new'), PLAIN),
    ).toBe('https://example.com/old')
  })

  it('rewrites the host and keeps path + query / 替換主機並保留路徑與查詢', () => {
    expect(
      displayUrl(record('http://localhost:4321/test/a?p=2'), {
        ...PLAIN,
        hostOverride: 'https://www.example.com',
      }),
    ).toBe('https://www.example.com/test/a?p=2')
  })

  it('ignores an invalid host override / 非法主機替換會被忽略', () => {
    expect(
      displayUrl(record('https://example.com/a'), { ...PLAIN, hostOverride: 'nope' }),
    ).toBe('https://example.com/a')
  })

  it('applies host override before decoding / 先替換主機再解碼', () => {
    expect(
      displayUrl(record('http://localhost:4321/%E4%B8%AD%E6%96%87'), {
        readableUrls: true,
        useFinalUrl: false,
        hostOverride: 'https://www.example.com',
      }),
    ).toBe('https://www.example.com/中文')
  })

  it('leaves the host in punycode when decoding / 解碼時主機維持 punycode', () => {
    expect(toReadableUrl('https://xn--r8jz45g.jp/%E4%B8%AD%E6%96%87')).toBe(
      'https://xn--r8jz45g.jp/中文',
    )
  })
})