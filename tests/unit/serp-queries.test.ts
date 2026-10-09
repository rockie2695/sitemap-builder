/**
 * Unit tests for SERP query derivation.
 *
 * SERP 查詢推導的單元測試。
 */
import { describe, expect, it } from 'vitest'

import { deriveQueries } from '@/lib/serp/queries'
import type { UrlRecord } from '@/types/crawl'
import type { SeoSnapshot } from '@/types/seo'

/** Minimal SEO snapshot with just the fields the derivation reads. */
function snapshot(overrides: Partial<SeoSnapshot> = {}): SeoSnapshot {
  return {
    title: 'Fallback title',
    titleLength: 14,
    metaDescription: null,
    metaDescriptionLength: 0,
    h1: [],
    headings: [],
    canonical: null,
    metaRobots: null,
    indexable: true,
    lang: null,
    hasViewport: false,
    openGraph: { title: false, description: false, image: false },
    twitter: { card: false, title: false, description: false, image: false },
    images: { total: 0, missingAlt: 0 },
    links: { internal: 0, external: 0, nofollow: 0 },
    wordCount: 0,
    structuredData: [],
    hreflang: [],
    keywords: [],
    ...overrides,
  }
}

/** Archive record with an optional snapshot. */
function record(url: string, seo?: SeoSnapshot): UrlRecord {
  return {
    url,
    status: 'done',
    depth: 0,
    httpStatus: 200,
    pageTitle: 'T',
    finalUrl: null,
    lastModified: null,
    redirected: false,
    foundLinks: 0,
    queuedAt: 0,
    startedAt: 0,
    finishedAt: 0,
    durationMs: 0,
    ...(seo ? { seo } : {}),
  }
}

describe('deriveQueries / 推導查詢', () => {
  it('prefers the H1, then the title / 優先 H1，其次標題', () => {
    const queries = deriveQueries([
      record('https://example.com/a', snapshot({ h1: ['Widget guide'] })),
      record('https://example.com/b', snapshot({ h1: [], title: 'Title query' })),
    ])
    expect(queries).toEqual([
      { query: 'Widget guide', url: 'https://example.com/a' },
      { query: 'Title query', url: 'https://example.com/b' },
    ])
  })

  it('falls back to the top keyword / 退回最高頻關鍵詞', () => {
    const queries = deriveQueries([
      record('https://example.com/a', snapshot({ h1: [], title: null, keywords: [{ term: 'sitemaps', count: 9 }] })),
    ])
    expect(queries[0].query).toBe('sitemaps')
  })

  it('de-duplicates case-insensitively / 不分大小寫去重', () => {
    const queries = deriveQueries([
      record('https://example.com/a', snapshot({ h1: ['Widget Guide'] })),
      record('https://example.com/b', snapshot({ h1: ['widget guide'] })),
    ])
    expect(queries).toHaveLength(1)
  })

  it('orders the worst SEO score first / 分數最低者優先', () => {
    const scores = new Map<string, number | null>([
      ['https://example.com/a', 90],
      ['https://example.com/b', 30],
      ['https://example.com/c', null],
    ])
    const queries = deriveQueries(
      [
        record('https://example.com/a', snapshot({ h1: ['Alpha topic'] })),
        record('https://example.com/b', snapshot({ h1: ['Beta topic'] })),
        record('https://example.com/c', snapshot({ h1: ['Charlie topic'] })),
      ],
      { scores },
    )
    expect(queries.map((entry) => entry.query)).toEqual(['Beta topic', 'Alpha topic', 'Charlie topic'])
  })

  it('ignores pages without a snapshot and caps the list / 略過未稽核頁並套用上限', () => {
    const records = [
      record('https://example.com/none'),
      record('https://example.com/a', snapshot({ h1: ['Alpha topic'] })),
      record('https://example.com/b', snapshot({ h1: ['Beta topic'] })),
      record('https://example.com/c', snapshot({ h1: ['Charlie topic'] })),
    ]
    const queries = deriveQueries(records, { maxQueries: 2 })
    expect(queries).toHaveLength(2)
    expect(queries.every((entry) => entry.query !== 'none')).toBe(true)
  })

  it('skips pages whose only signal is too short / 訊號過短則略過', () => {
    expect(deriveQueries([record('https://example.com/a', snapshot({ h1: ['x'], title: null }))])).toEqual([])
  })
})