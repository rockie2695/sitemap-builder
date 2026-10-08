/**
 * Unit tests for `lib/url-utils.ts`: parsing, normalization and scoping.
 *
 * `lib/url-utils.ts` 的單元測試：解析、規範化與範圍篩選。
 */
import { describe, expect, it } from 'vitest'

import {
  isTrackingParam,
  looksLikeHtmlPage,
  normalizeUrl,
  parseStartUrl,
  shouldInclude,
} from '@/lib/url-utils'

describe('parseStartUrl / 解析起始網址', () => {
  it('derives origin and path prefix / 推導 origin 與路徑前綴', () => {
    expect(parseStartUrl('https://www.example.com/test')).toEqual({
      origin: 'https://www.example.com',
      pathPrefix: '/test',
      startUrl: 'https://www.example.com/test',
    })
  })

  it('treats the root path as no prefix / 根路徑視為無前綴', () => {
    const parsed = parseStartUrl('https://example.com/')
    expect(parsed?.pathPrefix).toBe('')
    expect(parsed?.startUrl).toBe('https://example.com/')
  })

  it('keeps the trailing slash on the start URL / 起始網址保留末尾斜線', () => {
    const parsed = parseStartUrl('https://example.com/test/')
    expect(parsed?.startUrl).toBe('https://example.com/test/')
    expect(parsed?.pathPrefix).toBe('/test')
  })

  it('keeps the start URL query string / 保留起始網址的查詢參數', () => {
    const parsed = parseStartUrl('https://example.com/docs?page=2')
    expect(parsed?.startUrl).toBe('https://example.com/docs?page=2')
  })

  it('rejects invalid input / 拒絕非法輸入', () => {
    expect(parseStartUrl('')).toBeNull()
    expect(parseStartUrl('not-a-url')).toBeNull()
    expect(parseStartUrl('ftp://example.com/x')).toBeNull()
    expect(parseStartUrl('javascript:void(0)')).toBeNull()
  })
})

describe('normalizeUrl / 規範化連結', () => {
  it('resolves relative hrefs / 解析相對連結', () => {
    expect(normalizeUrl('a.html', 'https://example.com/test/')).toBe(
      'https://example.com/test/a.html',
    )
    expect(normalizeUrl('/test/b.html', 'https://example.com/test/')).toBe(
      'https://example.com/test/b.html',
    )
    expect(normalizeUrl('../outside.html', 'https://example.com/test/')).toBe(
      'https://example.com/outside.html',
    )
  })

  it('strips the hash / 去掉 hash', () => {
    expect(normalizeUrl('a.html#section', 'https://example.com/test/')).toBe(
      'https://example.com/test/a.html',
    )
    expect(normalizeUrl('#anchor', 'https://example.com/')).toBeNull()
  })

  it('strips the trailing slash but keeps the root / 去掉末尾斜線但保留根路徑', () => {
    expect(normalizeUrl('/test/', 'https://example.com')).toBe('https://example.com/test')
    expect(normalizeUrl('/', 'https://example.com')).toBe('https://example.com/')
  })

  it('drops the whole query when stripQuery is on / stripQuery 開啟時丟棄整個 query', () => {
    expect(normalizeUrl('/a?utm_source=x&page=2', 'https://example.com', { stripQuery: true })).toBe(
      'https://example.com/a',
    )
  })

  it('keeps the query minus tracking params when stripQuery is off / 關閉時保留 query 但剔除追蹤參數', () => {
    expect(
      normalizeUrl('/a?utm_source=x&page=2&gclid=abc', 'https://example.com', {
        stripQuery: false,
      }),
    ).toBe('https://example.com/a?page=2')
  })

  it('rejects non-http(s) protocols / 拒絕非 http(s) 協定', () => {
    expect(normalizeUrl('mailto:a@b.com', 'https://example.com/')).toBeNull()
    expect(normalizeUrl('javascript:void(0)', 'https://example.com/')).toBeNull()
    expect(normalizeUrl('tel:+123', 'https://example.com/')).toBeNull()
    expect(normalizeUrl('ftp://example.com/f', 'https://example.com/')).toBeNull()
  })

  it('drops default ports and lowercases the host / 去掉預設埠並小寫主機', () => {
    expect(normalizeUrl('https://EXAMPLE.com:443/a', 'https://example.com/')).toBe(
      'https://example.com/a',
    )
  })
})

describe('shouldInclude / 範圍篩選', () => {
  const origin = 'https://example.com'

  it('accepts same-origin URLs under the prefix / 接受前綴下的同源連結', () => {
    expect(shouldInclude('https://example.com/test', origin, '/test')).toBe(true)
    expect(shouldInclude('https://example.com/test/a', origin, '/test')).toBe(true)
    expect(shouldInclude('https://example.com/test/', origin, '/test')).toBe(true)
  })

  it('rejects cross-origin URLs / 拒絕跨源連結', () => {
    expect(shouldInclude('https://other.com/test/a', origin, '/test')).toBe(false)
  })

  it('does not match prefixes as substrings / 前綴不會被子字串誤匹配', () => {
    expect(shouldInclude('https://example.com/testing', origin, '/test')).toBe(false)
    expect(shouldInclude('https://example.com/testimonials', origin, '/test')).toBe(false)
  })

  it('accepts every path when the prefix is empty / 前綴為空時接受所有路徑', () => {
    expect(shouldInclude('https://example.com/anything', origin, '')).toBe(true)
  })

  it('rejects unparseable URLs / 拒絕無法解析的網址', () => {
    expect(shouldInclude('::::', origin, '/test')).toBe(false)
  })
})

describe('looksLikeHtmlPage / 非 HTML 資源過濾', () => {
  it('accepts page-like paths / 接受頁面型路徑', () => {
    expect(looksLikeHtmlPage('https://example.com/a.html')).toBe(true)
    expect(looksLikeHtmlPage('https://example.com/a')).toBe(true)
    expect(looksLikeHtmlPage('https://example.com/blog/post-1')).toBe(true)
    expect(looksLikeHtmlPage('https://example.com/')).toBe(true)
  })

  it('rejects binary assets and data files / 拒絕二進位與資料檔', () => {
    expect(looksLikeHtmlPage('https://example.com/doc.pdf')).toBe(false)
    expect(looksLikeHtmlPage('https://example.com/img/photo.jpg')).toBe(false)
    expect(looksLikeHtmlPage('https://example.com/assets/app.js')).toBe(false)
    expect(looksLikeHtmlPage('https://example.com/data.json')).toBe(false)
    expect(looksLikeHtmlPage('https://example.com/sitemap.xml')).toBe(false)
  })
})

describe('isTrackingParam / 追蹤參數判定', () => {
  it('matches utm_ prefixed keys and known click ids / 匹配 utm_ 前綴與常見點擊 id', () => {
    expect(isTrackingParam('utm_source')).toBe(true)
    expect(isTrackingParam('UTM_CAMPAIGN')).toBe(true)
    expect(isTrackingParam('gclid')).toBe(true)
    expect(isTrackingParam('fbclid')).toBe(true)
  })

  it('ignores regular params / 忽略一般參數', () => {
    expect(isTrackingParam('page')).toBe(false)
    expect(isTrackingParam('id')).toBe(false)
    expect(isTrackingParam('utm')).toBe(false)
  })
})