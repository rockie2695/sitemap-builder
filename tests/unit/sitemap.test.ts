/**
 * Unit tests for `lib/sitemap/*`: priority, changefreq, lastmod, XML building.
 *
 * `lib/sitemap/*` 的單元測試：priority、changefreq、lastmod 與 XML 建構。
 */
import { describe, expect, it } from 'vitest'

import { buildSitemapIndex, buildSitemapXml, escapeXml, formatPriority } from '@/lib/sitemap/build'
import {
  changefreqForDepth,
  resolveChangefreq,
  CHANGEFREQ_OPTIONS,
} from '@/lib/sitemap/changefreq'
import {
  formatW3CDateTime,
  resolveLastmod,
  toSitemapEntries,
  type SitemapExportOptions,
} from '@/lib/sitemap/entries'
import { priorityForDepth, pathDepthOf, relativePathDepthOf, resolvePriority } from '@/lib/sitemap/priority'
import { splitSitemaps, toDownloadPayloads } from '@/lib/sitemap/split'
import type { UrlRecord } from '@/types/crawl'

const CRAWLED_AT = Date.parse('2026-10-07T07:34:13Z')
const LAST_MODIFIED = 'Tue, 01 Sep 2026 08:30:00 GMT'

/** Build an archive record for tests. */
function record(url: string, depth: number, extra: Partial<UrlRecord> = {}): UrlRecord {
  return {
    url,
    status: 'done',
    depth,
    discoveredFrom: undefined,
    httpStatus: 200,
    pageTitle: 'T',
    finalUrl: null,
    lastModified: null,
    redirected: false,
    foundLinks: 0,
    queuedAt: CRAWLED_AT,
    startedAt: CRAWLED_AT,
    finishedAt: CRAWLED_AT,
    durationMs: 1000,
    ...extra,
  }
}

/** Switch presets. */
const ALL_OFF: SitemapExportOptions = {
  includeLastmod: false,
  includePriority: false,
  priorityStrategy: 'linkDepth',
  includeChangefreq: false,
  changefreq: 'auto',
  readableUrls: false,
  useFinalUrl: false,
  hostOverride: '',
  pathPrefix: '',
}
const ALL_ON: SitemapExportOptions = {
  includeLastmod: true,
  includePriority: true,
  priorityStrategy: 'linkDepth',
  includeChangefreq: true,
  changefreq: 'auto',
  readableUrls: false,
  useFinalUrl: false,
  hostOverride: '',
  pathPrefix: '',
}
const MANUAL: SitemapExportOptions = {
  includeLastmod: true,
  includePriority: true,
  priorityStrategy: 'linkDepth',
  includeChangefreq: true,
  changefreq: 'weekly',
  readableUrls: false,
  useFinalUrl: false,
  hostOverride: '',
  pathPrefix: '',
}

describe('path depth / 路徑深度', () => {
  it('counts non-empty path segments as-is / 原樣計算非空路徑段數', () => {
    expect(pathDepthOf('https://example.com/')).toBe(0)
    expect(pathDepthOf('https://example.com/a')).toBe(1)
    expect(pathDepthOf('https://example.com/a/b')).toBe(2)
    expect(pathDepthOf('https://example.com/a/b/c')).toBe(3)
  })

  it('ignores the query and a trailing slash / 忽略查詢與末尾斜線', () => {
    expect(pathDepthOf('https://example.com/a/b/')).toBe(2)
    expect(pathDepthOf('https://example.com/a/b?x=1')).toBe(2)
  })

  it('keeps the file extension counted as-is / 檔名含擴展名時原樣計數', () => {
    expect(pathDepthOf('https://example.com/blog/post-1.html')).toBe(2)
  })

  it('returns 0 for unparseable URLs / 無法解析時回傳 0', () => {
    expect(pathDepthOf('::::')).toBe(0)
  })

  it('computes depth relative to the prefix / 相對前綴計算深度', () => {
    expect(relativePathDepthOf('https://example.com/test/', '/test')).toBe(0)
    expect(relativePathDepthOf('https://example.com/test/a', '/test')).toBe(1)
    expect(relativePathDepthOf('https://example.com/test/a/b', '/test')).toBe(2)
  })

  it('falls back to the absolute depth outside the prefix / 不在前綴下時回退絕對深度', () => {
    expect(relativePathDepthOf('https://example.com/other/a', '/test')).toBe(2)
  })

  it('treats an empty prefix as the root / 空前綴視為根', () => {
    expect(relativePathDepthOf('https://example.com/a/b', '')).toBe(2)
  })
})

describe('resolvePriority / 三種優先級策略', () => {
  it('linkDepth follows the hop count / 按連結深度', () => {
    const context = { strategy: 'linkDepth' as const, pathPrefix: '/test' }
    expect(resolvePriority(record('https://example.com/test/a/b', 0), context)).toBe(1)
    expect(resolvePriority(record('https://example.com/test/a/b', 2), context)).toBe(0.6)
  })

  it('pathDepth follows the URL segments / 按絕對路徑深度', () => {
    const context = { strategy: 'pathDepth' as const, pathPrefix: '/test' }
    // `/` and `/a` both sit at the top level.
    expect(resolvePriority(record('https://example.com/', 5), context)).toBe(1)
    expect(resolvePriority(record('https://example.com/a', 5), context)).toBe(1)
    expect(resolvePriority(record('https://example.com/a/b', 5), context)).toBe(0.8)
    expect(resolvePriority(record('https://example.com/a/b/c', 5), context)).toBe(0.6)
  })

  it('relativePathDepth measures below the start prefix / 按相對前綴的路徑深度', () => {
    const context = { strategy: 'relativePathDepth' as const, pathPrefix: '/test' }
    expect(resolvePriority(record('https://example.com/test/', 0), context)).toBe(1)
    expect(resolvePriority(record('https://example.com/test/a', 0), context)).toBe(0.8)
    expect(resolvePriority(record('https://example.com/test/a/b', 0), context)).toBe(0.6)
  })

  it('is honuored by toSitemapEntries / 由 toSitemapEntries 採用', () => {
    const entries = toSitemapEntries(
      [record('https://example.com/a/b/c', 0)],
      { ...ALL_ON, priorityStrategy: 'pathDepth' as const, pathPrefix: '/test' },
    )
    expect(entries[0].priority).toBe(0.6)
  })
})

describe('priorityForDepth / 深度分層', () => {
  it('maps depth 0-3 to the ladder / 前 4 層對應階梯', () => {
    expect([0, 1, 2, 3].map(priorityForDepth)).toEqual([1, 0.8, 0.6, 0.4])
  })

  it('falls back from depth 4 / 第 4 層起使用兜底值', () => {
    expect([4, 7, 100].map(priorityForDepth)).toEqual([0.2, 0.2, 0.2])
  })

  it('handles invalid depth / 處理非法深度', () => {
    expect(priorityForDepth(-1)).toBe(0.2)
    expect(priorityForDepth(Number.NaN)).toBe(0.2)
  })
})

describe('changefreq / 變更頻率', () => {
  it('derives from depth in auto mode / auto 模式按深度推導', () => {
    expect([0, 1, 2, 3, 7].map(changefreqForDepth)).toEqual([
      'daily',
      'weekly',
      'monthly',
      'yearly',
      'yearly',
    ])
  })

  it('respects the manual setting / 手動值優先', () => {
    expect(resolveChangefreq('weekly', 0)).toBe('weekly')
    expect(resolveChangefreq('auto', 1)).toBe('weekly')
  })

  it('exposes the dropdown options / 提供下拉選項', () => {
    expect(CHANGEFREQ_OPTIONS[0]).toEqual({ value: 'auto', label: '按深度自动' })
    expect(CHANGEFREQ_OPTIONS).toHaveLength(8)
  })
})

describe('lastmod / 最後修改時間', () => {
  it('prefers the Last-Modified header / 優先使用響應頭', () => {
    expect(
      resolveLastmod(record('/a', 0, { lastModified: LAST_MODIFIED, finishedAt: CRAWLED_AT })),
    ).toBe('2026-09-01T08:30:00+00:00')
  })

  it('falls back to the crawl time / 回退到抓取時間', () => {
    expect(resolveLastmod(record('/a', 0, { lastModified: null }))).toBe(
      '2026-10-07T07:34:13+00:00',
    )
  })

  it('falls back when the header is not a date / 響應頭不是日期時回退', () => {
    expect(resolveLastmod(record('/a', 0, { lastModified: 'not-a-date' }))).toBe(
      '2026-10-07T07:34:13+00:00',
    )
  })

  it('returns null when nothing is available / 都沒有時回傳 null', () => {
    expect(resolveLastmod(record('/a', 0, { lastModified: null, finishedAt: null }))).toBeNull()
  })

  it('formats W3C date-time with a timezone / 輸出帶時區的 W3C 格式', () => {
    expect(formatW3CDateTime(new Date('2026-10-07T07:34:13Z'))).toBe('2026-10-07T07:34:13+00:00')
  })
})

describe('toSitemapEntries / 開關組合', () => {
  it('emits only loc when every switch is off / 全關時只輸出 loc', () => {
    const entries = toSitemapEntries([record('https://example.com/a', 0)], ALL_OFF)
    expect(entries).toEqual([{ url: 'https://example.com/a' }])
  })

  it('emits every field when every switch is on / 全開時輸出所有欄位', () => {
    const [entry] = toSitemapEntries(
      [record('https://example.com/a', 1, { lastModified: LAST_MODIFIED })],
      ALL_ON,
    )
    expect(entry.lastmod).toBe('2026-09-01T08:30:00+00:00')
    expect(entry.priority).toBe(0.8)
    expect(entry.changefreq).toBe('weekly')
  })

  it('uses the manual changefreq value / 使用手動 changefreq', () => {
    const [entry] = toSitemapEntries([record('https://example.com/a', 0)], MANUAL)
    expect(entry.changefreq).toBe('weekly')
  })
})

describe('buildSitemapXml / XML 建構', () => {
  it('writes the declaration and namespace / 寫出宣告與命名空間', () => {
    const xml = buildSitemapXml([])
    expect(xml).toBe(
      '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n</urlset>\n',
    )
  })

  it('orders fields loc → lastmod → changefreq → priority / 欄位順序', () => {
    const xml = buildSitemapXml(
      toSitemapEntries([record('https://example.com/a', 0, { lastModified: LAST_MODIFIED })], ALL_ON),
    )
    expect(xml).toContain('<loc>https://example.com/a</loc>')
    expect(xml.indexOf('<lastmod>')).toBeGreaterThan(xml.indexOf('<loc>'))
    expect(xml.indexOf('<changefreq>')).toBeGreaterThan(xml.indexOf('<lastmod>'))
    expect(xml.indexOf('<priority>')).toBeGreaterThan(xml.indexOf('<changefreq>'))
  })

  it('always formats priority with one decimal / priority 固定一位小數', () => {
    const xml = buildSitemapXml([{ url: 'https://example.com/a', priority: 1 }])
    expect(xml).toContain('<priority>1.0</priority>')
    expect(xml).not.toContain('<priority>1</priority>')
  })

  it('clamps priority into 0.0-1.0 / priority 夾在範圍內', () => {
    expect(formatPriority(5)).toBe('1.0')
    expect(formatPriority(-3)).toBe('0.0')
  })

  it('omits null fields / 省略 null 欄位', () => {
    const xml = buildSitemapXml([{ url: 'https://example.com/a', lastmod: null }])
    expect(xml).not.toContain('<lastmod>')
  })

  it('escapes XML metacharacters / 轉義 XML 特殊字元', () => {
    expect(escapeXml('a & b < c > d " e')).toBe('a &amp; b &lt; c &gt; d &quot; e')
    // The URL's ampersand must be escaped in the output XML.
    const xml = buildSitemapXml([{ url: 'https://example.com/a?x=1&y=2' }])
    expect(xml).toContain('<loc>https://example.com/a?x=1&amp;y=2</loc>')
    expect(xml).not.toContain('<loc>https://example.com/a?x=1&y=2</loc>') // raw & must be escaped
  })

  it('de-duplicates URLs keeping the first / 去重並保留第一筆', () => {
    const xml = buildSitemapXml([
      { url: 'https://example.com/a' },
      { url: 'https://example.com/a' },
      { url: 'https://example.com/b' },
    ])
    expect(xml.match(/<url>/g)).toHaveLength(2)
  })
})

describe('buildSitemapIndex / 索引檔', () => {
  it('references every split file / 引用每個分片', () => {
    const xml = buildSitemapIndex(
      [
        { name: 'sitemap-1.xml', lastmod: '2026-10-07T07:34:13+00:00' },
        { name: 'sitemap-2.xml', lastmod: null },
      ],
      'https://example.com',
    )
    expect(xml).toContain('<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">')
    expect(xml).toContain('<loc>https://example.com/sitemap-1.xml</loc>')
    expect(xml).toContain('<lastmod>2026-10-07T07:34:13+00:00</lastmod>')
    expect(xml).toContain('<loc>https://example.com/sitemap-2.xml</loc>')
    // No lastmod for the second file.
    expect(xml.match(/<lastmod>/g)).toHaveLength(1)
  })

  it('strips a trailing slash from the base URL / 去掉基底網址的末尾斜線', () => {
    const xml = buildSitemapIndex([{ name: 'sitemap-1.xml' }], 'https://example.com/')
    expect(xml).toContain('<loc>https://example.com/sitemap-1.xml</loc>')
  })
})

describe('splitSitemaps / 多檔拆分', () => {
  const many = (count: number) =>
    Array.from({ length: count }, (_, index) => ({
      url: `https://example.com/page-${index}`,
      lastmod: index === count - 1 ? '2026-10-07T07:34:13+00:00' : null,
    }))

  it('returns a single sitemap.xml without an index when it fits / 未超限時單檔且無索引', () => {
    const result = splitSitemaps(many(5), 10, 'https://example.com')
    expect(result.split).toBe(false)
    expect(result.index).toBeNull()
    expect(result.files).toHaveLength(1)
    expect(result.files[0].name).toBe('sitemap.xml')
    expect(result.files[0].count).toBe(5)
  })

  it('splits into N files plus an index / 超限時拆分為 N 檔加索引', () => {
    const result = splitSitemaps(many(25), 10, 'https://example.com')
    expect(result.split).toBe(true)
    expect(result.index).not.toBeNull()
    expect(result.files.map((file) => file.name)).toEqual([
      'sitemap-1.xml',
      'sitemap-2.xml',
      'sitemap-3.xml',
    ])
    expect(result.files.map((file) => file.count)).toEqual([10, 10, 5])
    expect(result.index).toContain('<loc>https://example.com/sitemap-1.xml</loc>')
    expect(result.index).toContain('<loc>https://example.com/sitemap-3.xml</loc>')
  })

  it('carries the newest lastmod into the index / 索引使用最新 lastmod', () => {
    const result = splitSitemaps(many(25), 10, 'https://example.com')
    expect(result.files[2].lastmod).toBe('2026-10-07T07:34:13+00:00')
    expect(result.index).toContain('<lastmod>2026-10-07T07:34:13+00:00</lastmod>')
  })

  it('de-duplicates before splitting / 拆分前先去重', () => {
    const entries = [...many(5), { url: 'https://example.com/page-0', lastmod: null }]
    const result = splitSitemaps(entries, 10, 'https://example.com')
    expect(result.files[0].count).toBe(5)
  })

  it('flags the protocol limit / 標記協定上限', () => {
    const result = splitSitemaps(many(25), 10, 'https://example.com')
    expect(result.overProtocolLimit).toBe(false)
  })

  it('clamps maxUrlsPerFile to at least 1 / 上限最小為 1', () => {
    // A limit of 0 is clamped to 1: three URLs become three single-URL files.
    const result = splitSitemaps(many(3), 0, 'https://example.com')
    expect(result.split).toBe(true)
    expect(result.files).toHaveLength(3)
    expect(result.files.every((file) => file.count === 1)).toBe(true)
  })

  it('converts results into download payloads / 轉換為可下載內容', () => {
    const result = splitSitemaps(many(25), 10, 'https://example.com')
    const payloads = toDownloadPayloads(result)
    expect(payloads.map((payload) => payload.name)).toEqual([
      'sitemap-1.xml',
      'sitemap-2.xml',
      'sitemap-3.xml',
      'sitemapindex.xml',
    ])
    expect(payloads.every((payload) => payload.mime === 'application/xml')).toBe(true)
  })
})