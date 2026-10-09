/**
 * Component tests for the SEO tab.
 *
 * SEO 標籤頁的元件測試。
 */
import { createElement } from 'react'
import { describe, expect, it } from 'vitest'

import { SeoTab } from '@/components/dashboard/SeoTab'
import { renderWithI18n, screen, userEvent } from '../helpers/render'
import { createSerpStub } from '../helpers/serp'
import type { UrlRecord } from '@/types/crawl'
import type { SeoSnapshot } from '@/types/seo'

/** The audit tab, with an inert SERP workspace. */
function AuditTab({ records }: { records: UrlRecord[] }) {
  return createElement(SeoTab, { records, serp: createSerpStub() })
}

/** A snapshot that passes every scored check. */
function snapshot(overrides: Partial<SeoSnapshot> = {}): SeoSnapshot {
  return {
    title: 'A perfectly sized page title',
    titleLength: 28,
    metaDescription:
      'A meta description that sits comfortably inside the recommended length window for search results.',
    metaDescriptionLength: 97,
    h1: ['One heading'],
    headings: [{ level: 1, text: 'One heading' }],
    canonical: null,
    metaRobots: null,
    indexable: true,
    lang: 'en',
    hasViewport: true,
    openGraph: { title: true, description: true, image: true },
    twitter: { card: true, title: true, description: true, image: true },
    images: { total: 1, missingAlt: 0 },
    links: { internal: 1, external: 0, nofollow: 0 },
    wordCount: 400,
    structuredData: ['Article'],
    hreflang: [],
    keywords: [{ term: 'widgets', count: 4 }],
    ...overrides,
  }
}

/** Archive record. */
function record(url: string, overrides: Partial<SeoSnapshot> = {}, withSeo = true): UrlRecord {
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
    durationMs: 1000,
    ...(withSeo ? { seo: snapshot({ canonical: url, ...overrides }) } : {}),
  }
}

describe('SeoTab', () => {
  it('shows an empty state before any audit data / 無資料時顯示空狀態', () => {
    renderWithI18n(<AuditTab records={[record('https://example.com/a', {}, false)]} />)
    expect(screen.getByText('No SEO data yet')).toBeInTheDocument()
  })

  it('summarises the audit / 顯示稽核摘要', () => {
    renderWithI18n(
      <AuditTab
        records={[
          record('https://example.com/a'),
          record('https://example.com/b', { title: null, titleLength: 0, metaDescription: null, metaDescriptionLength: 0, h1: [] }),
        ]}
      />,
    )
    // Scope each lookup to its stat block: several stats can read "2".
    const audited = screen.getByText('Pages audited').parentElement
    expect(audited?.textContent).toContain('2')
    const average = screen.getByText('Average score').parentElement
    const averageValue = Number(average?.querySelectorAll('p')[1]?.textContent)
    expect(averageValue).toBeLessThan(100)
  })

  it('lists site-wide issues with counts / 列出全站問題與數量', () => {
    renderWithI18n(
      <AuditTab
        records={[
          record('https://example.com/a'),
          record('https://example.com/b'),
          record('https://example.com/c', { title: null, titleLength: 0 }),
        ]}
      />,
    )
    // a and b share a title; c has none.
    expect(screen.getByText('Duplicate titles').textContent).toContain('2')
    expect(screen.getByText('Missing title').textContent).toContain('1')
  })

  it('renders one row per audited page / 每個已稽核頁面一列', () => {
    renderWithI18n(<AuditTab records={[record('https://example.com/a'), record('https://example.com/b')]} />)
    expect(screen.getByText('https://example.com/a')).toBeInTheDocument()
    expect(screen.getByText('https://example.com/b')).toBeInTheDocument()
  })

  it('filters to pages with issues / 可只看有問題的頁面', async () => {
    const user = userEvent.setup()
    renderWithI18n(
      <AuditTab
        records={[
          // The good page needs a unique title *and* description, otherwise it is
          // itself caught by the duplicate rules.
          record('https://example.com/good', {
            title: 'A unique good page title',
            titleLength: 26,
            metaDescription: 'A unique description that only this particular page uses, comfortably long.',
            metaDescriptionLength: 82,
          }),
          record('https://example.com/bad', { title: null, titleLength: 0 }),
        ]}
      />,
    )
    await user.click(screen.getByRole('switch'))
    expect(screen.queryByText('https://example.com/good')).not.toBeInTheDocument()
    expect(screen.getByText('https://example.com/bad')).toBeInTheDocument()
  })

  it('searches by URL / 可依 URL 搜尋', async () => {
    const user = userEvent.setup()
    renderWithI18n(<AuditTab records={[record('https://example.com/alpha'), record('https://example.com/beta')]} />)
    await user.type(screen.getByPlaceholderText('Search URL or title'), 'beta')
    expect(screen.getByText('https://example.com/beta')).toBeInTheDocument()
    expect(screen.queryByText('https://example.com/alpha')).not.toBeInTheDocument()
  })

  it('opens the per-page detail with checks and fix hints / 開啟單頁詳情', async () => {
    const user = userEvent.setup()
    renderWithI18n(
      <AuditTab records={[record('https://example.com/bad', { title: null, titleLength: 0 })]} />,
    )
    await user.click(screen.getByText('https://example.com/bad'))
    expect(screen.getByText('Page detail')).toBeInTheDocument()
    expect(screen.getByText('Checks for this page')).toBeInTheDocument()
    expect(screen.getByText('Title tag present')).toBeInTheDocument()
    // A failing check shows its fix hint.
    expect(screen.getByText('Add a unique <title> to the page')).toBeInTheDocument()
  })
})