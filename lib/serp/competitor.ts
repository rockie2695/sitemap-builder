/**
 * Competitor on-page analysis.
 *
 * Reuses the exact same SEO extractor as our own crawl, so the comparison is
 * apples-to-apples. Runs in its own browser context and never touches the crawl scope.
 *
 * 競品單頁分析。沿用與自家抓取完全相同的 SEO 採集器，確保比較基準一致。
 * 使用獨立的瀏覽器 context，不涉及抓取範圍。
 */
import type { Page } from 'playwright'

import { getBrowser } from '@/lib/browser'
import { collectSeoFromDocument } from '@/lib/crawler/seoDocument'
import type { SeoSnapshot } from '@/types/seo'
import type { SerpCompetitor } from '@/types/serp'

/** A normal Chrome UA: the SERP pages refuse unknown agents. */
const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'

/** Navigation timeout for a competitor page. */
const NAV_TIMEOUT = 15_000

/**
 * Collect the on-page SEO snapshot of an arbitrary page.
 *
 * @param url    Competitor URL.
 * @param signal Abort signal forwarded from the request.
 * @returns Metrics shaped for comparison, or an entry carrying `error`.
 */
export async function analyzeCompetitorPage(
  url: string,
  signal?: AbortSignal,
): Promise<SerpCompetitor> {
  const startedAt = Date.now()
  void startedAt

  let context: Awaited<ReturnType<Awaited<ReturnType<typeof getBrowser>>['newContext']>> | undefined
  let page: Page | undefined

  try {
    const browser = await getBrowser()
    context = await browser.newContext({
      userAgent: USER_AGENT,
      viewport: { width: 1365, height: 900 },
      locale: 'en-US',
    })
    page = await context.newPage()
    page.setDefaultNavigationTimeout(NAV_TIMEOUT)

    const onAbort = () => {
      if (page && !page.isClosed()) void page.close().catch(() => undefined)
    }
    signal?.addEventListener('abort', onAbort, { once: true })

    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: NAV_TIMEOUT })
    await page.waitForLoadState('networkidle', { timeout: 5_000 }).catch(() => undefined)

    const collectSeo = collectSeoFromDocument as unknown as () => SeoSnapshot
    const seo = await page.evaluate<SeoSnapshot>(collectSeo)

    return {
      url,
      title: seo.title,
      titleLength: seo.titleLength,
      descriptionLength: seo.metaDescriptionLength,
      h1Count: seo.h1.length,
      wordCount: seo.wordCount,
      structuredData: seo.structuredData,
    }
  } catch (error) {
    return {
      url,
      title: null,
      titleLength: 0,
      descriptionLength: 0,
      h1Count: 0,
      wordCount: 0,
      structuredData: [],
      error: error instanceof Error ? error.message.split('\n')[0] : String(error),
    }
  } finally {
    await context?.close().catch(() => undefined)
  }
}