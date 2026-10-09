/**
 * Component tests for the SERP panel.
 *
 * The panel is fed a stub `useSerp()` result, so the ranking logic is not exercised
 * here — only rendering, the queue table and the detail view.
 *
 * SERP 面板的元件測試。以樁 `useSerp()` 結果餵入，因此不觸發排名邏輯，
 * 只驗證渲染、佇列表格與詳情。
 */
import { describe, expect, it, vi } from 'vitest'

import { SerpPanel } from '@/components/dashboard/SerpPanel'
import { renderWithI18n, screen, userEvent } from '../helpers/render'
import { createSerpStub } from '../helpers/serp'
import type { UrlRecord } from '@/types/crawl'
import type { SeoSnapshot } from '@/types/seo'
import type { SerpRecord } from '@/types/serp'

const URL = 'https://example.com/widgets'

/** Snapshot good enough to mark a page as audited. */
function snapshot(): SeoSnapshot {
  return {
    title: 'Widget guide',
    titleLength: 12,
    metaDescription: null,
    metaDescriptionLength: 0,
    h1: ['Widget guide'],
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
    wordCount: 10,
    structuredData: [],
    hreflang: [],
    keywords: [],
  }
}

/** Archive record. */
function record(withSeo = true): UrlRecord {
  return {
    url: URL,
    status: 'done',
    depth: 0,
    httpStatus: 200,
    pageTitle: 'Widget guide',
    finalUrl: null,
    lastModified: null,
    redirected: false,
    foundLinks: 0,
    queuedAt: 0,
    startedAt: 0,
    finishedAt: 0,
    durationMs: 0,
    ...(withSeo ? { seo: snapshot() } : {}),
  }
}

/** A stored SERP record. */
const serpRecord: SerpRecord = {
  query: 'widget guide',
  engine: 'google',
  provider: 'playwright',
  checkedAt: 0,
  rank: 4,
  results: [{ position: 1, url: 'https://top.com/', title: 'Top result', hostname: 'top.com' }],
  competitors: [
    {
      url: 'https://top.com/',
      title: 'Top',
      titleLength: 30,
      descriptionLength: 120,
      h1Count: 1,
      wordCount: 800,
      structuredData: ['Article'],
    },
  ],
}

describe('SerpPanel', () => {
  it('shows an empty state without audited pages / 無已稽核頁面時顯示空狀態', () => {
    renderWithI18n(<SerpPanel records={[record(false)]} serp={createSerpStub()} />)
    expect(screen.getByText('No audited pages yet')).toBeInTheDocument()
  })

  it('renders the queue with ranks / 渲染佇列與排名', () => {
    renderWithI18n(
      <SerpPanel
        records={[record()]}
        serp={createSerpStub({
          queries: [{ query: 'widget guide', url: URL }],
          results: { [URL]: serpRecord },
          completed: 1,
        })}
      />,
    )
    expect(screen.getByText('widget guide')).toBeInTheDocument()
    expect(screen.getByText('#4')).toBeInTheDocument()
    expect(screen.getByText('top.com')).toBeInTheDocument()
  })

  it('opens the detail with competitor comparison / 開啟詳情並顯示競品比較', async () => {
    const user = userEvent.setup()
    renderWithI18n(
      <SerpPanel
        records={[record()]}
        serp={createSerpStub({
          queries: [{ query: 'widget guide', url: URL }],
          results: { [URL]: serpRecord },
          completed: 1,
        })}
      />,
    )
    await user.click(screen.getByText('widget guide'))
    expect(screen.getByText('SERP detail')).toBeInTheDocument()
    expect(screen.getByText('Top organic results')).toBeInTheDocument()
    expect(screen.getByText('Top competitors')).toBeInTheDocument()
    expect(screen.getByText(/Article/)).toBeInTheDocument()
  })

  it('surfaces a fatal block with a resume affordance / 顯示致命封鎖與恢復按鈕', async () => {
    const resume = vi.fn()
    renderWithI18n(
      <SerpPanel
        records={[record()]}
        serp={createSerpStub({
          status: 'paused',
          queries: [{ query: 'widget guide', url: URL }],
          fatal: { code: 'blocked', message: 'CAPTCHA' },
          resume,
        })}
      />,
    )
    expect(screen.getByText('Run stopped')).toBeInTheDocument()
    expect(screen.getByText(/block page/)).toBeInTheDocument()
    await userEvent.setup().click(screen.getByText('Resume'))
    expect(resume).toHaveBeenCalled()
  })
})