/**
 * Unit tests for the SEO scorer and the site-wide report.
 *
 * SEO 評分與全站報告的單元測試。
 */
import { describe, expect, it } from 'vitest'

import { buildSeoReport, countReportFindings } from '@/lib/seo/report'
import {
  CHECK_WEIGHTS,
  EMPTY_SCORE_CONTEXT,
  contextFromReport,
  evaluateChecks,
  scoreChecks,
  scorePage,
} from '@/lib/seo/score'
import type { UrlRecord } from '@/types/crawl'
import type { SeoCheck, SeoSnapshot } from '@/types/seo'

/** A snapshot that satisfies every scored check. */
function perfectSnapshot(overrides: Partial<SeoSnapshot> = {}): SeoSnapshot {
  return {
    title: 'A perfectly sized page title',
    titleLength: 28,
    metaDescription:
      'A meta description that sits comfortably inside the recommended length window for search results.',
    metaDescriptionLength: 97,
    h1: ['The one and only heading'],
    headings: [{ level: 1, text: 'The one and only heading' }],
    canonical: 'https://example.com/page',
    metaRobots: null,
    indexable: true,
    lang: 'en',
    hasViewport: true,
    openGraph: { title: true, description: true, image: true },
    twitter: { card: true, title: true, description: true, image: true },
    images: { total: 2, missingAlt: 0 },
    links: { internal: 3, external: 1, nofollow: 0 },
    wordCount: 500,
    structuredData: ['Article'],
    hreflang: ['en'],
    keywords: [{ term: 'widgets', count: 4 }],
    ...overrides,
  }
}

/** Archive record carrying a snapshot. */
function record(url: string, seo?: SeoSnapshot): UrlRecord {
  return {
    url,
    status: 'done',
    depth: 0,
    httpStatus: 200,
    pageTitle: seo?.title ?? null,
    finalUrl: null,
    lastModified: null,
    redirected: false,
    foundLinks: 0,
    queuedAt: 0,
    startedAt: 0,
    finishedAt: 0,
    durationMs: 1000,
    seo,
  }
}

/**
 * A record whose canonical matches its own URL.
 *
 * Using the bare `record(...)` helper would make every page look like a canonical
 * mismatch, because the shared fixture canonical points at `/page`.
 */
function pageFor(url: string, overrides: Partial<SeoSnapshot> = {}): UrlRecord {
  return record(url, perfectSnapshot({ canonical: url, ...overrides }))
}

/** Find one check by id. */
function check(checks: SeoCheck[], id: SeoCheck['id']): SeoCheck {
  const found = checks.find((entry) => entry.id === id)
  if (!found) throw new Error(`missing check ${id}`)
  return found
}

describe('CHECK_WEIGHTS / 權重', () => {
  it('sums to 100 / 合計 100', () => {
    const total = Object.values(CHECK_WEIGHTS).reduce((sum, weight) => sum + weight, 0)
    expect(total).toBe(100)
  })

  it('keeps hreflang informational / hreflang 為純資訊', () => {
    expect(CHECK_WEIGHTS['hreflang.present']).toBe(0)
  })
})

describe('evaluateChecks / 規則判定', () => {
  it('passes everything for a clean page / 乾淨頁面全部通過', () => {
    const checks = evaluateChecks(perfectSnapshot(), 'https://example.com/page', EMPTY_SCORE_CONTEXT)
    expect(checks.every((entry) => entry.status === 'pass')).toBe(true)
    expect(scoreChecks(checks)).toBe(100)
  })

  it('fails a page with no title, description or h1 / 缺標題、描述、h1 時不合格', () => {
    const checks = evaluateChecks(
      perfectSnapshot({ title: null, titleLength: 0, metaDescription: null, metaDescriptionLength: 0, h1: [] }),
      'https://example.com/page',
      EMPTY_SCORE_CONTEXT,
    )
    expect(check(checks, 'title.present').status).toBe('fail')
    expect(check(checks, 'description.present').status).toBe('fail')
    expect(check(checks, 'h1.present').status).toBe('fail')
    expect(check(checks, 'h1.single').status).toBe('info')
    expect(scoreChecks(checks)).toBeLessThan(70)
  })

  it('warns on out-of-range title and description lengths / 長度超出範圍時警告', () => {
    const checks = evaluateChecks(
      perfectSnapshot({ title: 'x', titleLength: 1, metaDescription: 'y', metaDescriptionLength: 1 }),
      'https://example.com/page',
      EMPTY_SCORE_CONTEXT,
    )
    expect(check(checks, 'title.length').status).toBe('warn')
    expect(check(checks, 'description.length').status).toBe('warn')
  })

  it('warns on duplicate titles and descriptions / 重複標題與描述時警告', () => {
    const context = {
      duplicateTitles: new Set(['A perfectly sized page title']),
      duplicateDescriptions: new Set([perfectSnapshot().metaDescription as string]),
    }
    const checks = evaluateChecks(perfectSnapshot(), 'https://example.com/page', context)
    expect(check(checks, 'title.unique').status).toBe('warn')
    expect(check(checks, 'description.unique').status).toBe('warn')
  })

  it('fails multiple h1 and multiple missing alts / 多個 h1 與大量缺 alt 時不合格', () => {
    const checks = evaluateChecks(
      perfectSnapshot({ h1: ['a', 'b'], images: { total: 4, missingAlt: 4 } }),
      'https://example.com/page',
      EMPTY_SCORE_CONTEXT,
    )
    expect(check(checks, 'h1.single').status).toBe('fail')
    expect(check(checks, 'images.alt').status).toBe('fail')
  })

  it('treats a page without images as informational / 無圖片時視為資訊項', () => {
    const checks = evaluateChecks(
      perfectSnapshot({ images: { total: 0, missingAlt: 0 } }),
      'https://example.com/page',
      EMPTY_SCORE_CONTEXT,
    )
    expect(check(checks, 'images.alt').status).toBe('info')
  })

  it('flags noindex as a failure / noindex 為不合格', () => {
    const checks = evaluateChecks(
      perfectSnapshot({ indexable: false, metaRobots: 'noindex' }),
      'https://example.com/page',
      EMPTY_SCORE_CONTEXT,
    )
    expect(check(checks, 'robots.indexable').status).toBe('fail')
  })

  it('warns when the canonical points elsewhere / canonical 指向別處時警告', () => {
    const checks = evaluateChecks(
      perfectSnapshot({ canonical: 'https://example.com/other' }),
      'https://example.com/page',
      EMPTY_SCORE_CONTEXT,
    )
    expect(check(checks, 'canonical.self').status).toBe('warn')
    // A trailing slash is not a mismatch.
    const tolerant = evaluateChecks(
      perfectSnapshot({ canonical: 'https://example.com/page/' }),
      'https://example.com/page',
      EMPTY_SCORE_CONTEXT,
    )
    expect(check(tolerant, 'canonical.self').status).toBe('pass')
  })

  it('reports thin content / 內容過少', () => {
    const checks = evaluateChecks(
      perfectSnapshot({ wordCount: 20 }),
      'https://example.com/page',
      EMPTY_SCORE_CONTEXT,
    )
    expect(check(checks, 'content.length').status).toBe('fail')
  })
})

describe('scoreChecks / 分數計算', () => {
  it('gives half credit to warnings / 警告得一半分', () => {
    const pass: SeoCheck[] = [{ id: 'robots.indexable', status: 'pass' }]
    const warn: SeoCheck[] = [{ id: 'robots.indexable', status: 'warn' }]
    expect(scoreChecks(pass)).toBe(100)
    expect(scoreChecks(warn)).toBe(50)
  })

  it('excludes informational checks from the denominator / 資訊項不計入分母', () => {
    const withHreflang: SeoCheck[] = [
      { id: 'robots.indexable', status: 'pass' },
      { id: 'hreflang.present', status: 'pass' },
    ]
    const withoutHreflang: SeoCheck[] = [
      { id: 'robots.indexable', status: 'pass' },
      { id: 'hreflang.present', status: 'info' },
    ]
    expect(scoreChecks(withHreflang)).toBe(scoreChecks(withoutHreflang))
  })

  it('returns null when nothing is gradable / 無可評分項時回傳 null', () => {
    expect(scoreChecks([{ id: 'hreflang.present', status: 'info' }])).toBeNull()
    expect(scoreChecks([])).toBeNull()
  })
})

describe('scorePage / 單頁評分', () => {
  it('returns a null score without a snapshot / 無快照時為 null', () => {
    expect(scorePage(record('https://example.com/a'))).toEqual({ score: null, checks: [] })
  })

  it('uses the duplicate context / 使用重複集合', () => {
    const snapshot = perfectSnapshot()
    const page = record('https://example.com/page', snapshot)
    expect(scorePage(page, EMPTY_SCORE_CONTEXT).score).toBe(100)
    const reported = buildSeoReport([page, record('https://example.com/other', snapshot)])
    expect(scorePage(page, contextFromReport(reported)).score).toBeLessThan(100)
  })
})

describe('buildSeoReport / 全站報告', () => {
  const shared = perfectSnapshot()

  it('groups duplicate titles and descriptions / 分組重複標題與描述', () => {
    const report = buildSeoReport([
      record('https://example.com/a', shared),
      record('https://example.com/b', shared),
      record('https://example.com/c', perfectSnapshot({ title: 'unique', metaDescription: 'unique too' })),
    ])
    expect(report.duplicateTitles).toHaveLength(1)
    expect(report.duplicateTitles[0].urls).toEqual(['https://example.com/a', 'https://example.com/b'])
    expect(report.duplicateDescriptions).toHaveLength(1)
  })

  it('lists pages missing basics / 列出缺少基本項的頁面', () => {
    const report = buildSeoReport([
      record('https://example.com/a', perfectSnapshot({ title: null, metaDescription: null })),
      record('https://example.com/b', perfectSnapshot()),
    ])
    expect(report.missingTitle).toEqual(['https://example.com/a'])
    expect(report.missingDescription).toEqual(['https://example.com/a'])
  })

  it('lists multiple h1, noindex, thin content and canonical mismatches / 列出多 h1、noindex、內容過少與 canonical 不一致', () => {
    const report = buildSeoReport([
      pageFor('https://example.com/a', { h1: ['a', 'b'] }),
      pageFor('https://example.com/b', { indexable: false, metaRobots: 'noindex' }),
      pageFor('https://example.com/c', { wordCount: 10 }),
      pageFor('https://example.com/d', { canonical: 'https://example.com/elsewhere' }),
    ])
    expect(report.multipleH1).toEqual(['https://example.com/a'])
    expect(report.notIndexable).toEqual(['https://example.com/b'])
    expect(report.thinContent).toEqual(['https://example.com/c'])
    expect(report.canonicalMismatch).toEqual(['https://example.com/d'])
  })

  it('ignores pages without a snapshot / 忽略沒有快照的頁面', () => {
    const report = buildSeoReport([record('https://example.com/a'), pageFor('https://example.com/b')])
    expect(report.missingTitle).toEqual([])
    expect(countReportFindings(report)).toBe(0)
  })

  it('counts every finding / 統計所有發現', () => {
    const report = buildSeoReport([
      pageFor('https://example.com/a'),
      pageFor('https://example.com/b'),
      pageFor('https://example.com/c', {
        title: 'A unique title for page c',
        titleLength: 27,
        metaDescription: null,
        metaDescriptionLength: 0,
      }),
    ])
    expect(countReportFindings(report)).toBe(5)
  })
})