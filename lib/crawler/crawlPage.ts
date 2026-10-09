/**
 * Server-side page fetching: everything the crawl API does except HTTP concerns.
 *
 * Split out of `app/api/crawl/route.ts` so the browser lifecycle can be unit
 * tested with a fake browser, and so the route file stays a thin adapter.
 *
 * 伺服器端抓取單頁：除了 HTTP 層之外的流程。
 * 從 `app/api/crawl/route.ts` 抽出，讓瀏覽器生命週期可以用假實作做單元測試，
 * 路由檔案也得以維持為薄薄的轉接層。
 */
import type { Browser } from 'playwright'

import { getBrowser as getSharedBrowser } from '@/lib/browser'
import type { SeoSnapshot } from '@/types/seo'

import { extractLinks } from './extractLinks'
import { collectSeoFromDocument } from './seoDocument'
import type { CrawlResponsePayload } from './schema'

/** Input for a single page fetch. */
export interface CrawlPageParams {
  url: string
  origin: string
  pathPrefix: string
  stripQuery: boolean
  /** Abort signal forwarded from the HTTP request (user pressed stop). */
  signal?: AbortSignal
}

/** Injectable collaborators; overridden in unit tests. */
export interface CrawlPageDeps {
  /** Resolves the shared chromium instance. */
  getBrowser?: () => Promise<Browser>
}

/** Status codes this module can produce. */
export const CRAWL_STATUS = {
  /** Page loaded and links were extracted. */
  ok: 200,
  /** Page loaded with an error, but links were still extracted. */
  partial: 206,
  /** Nothing usable came back (browser failed, extraction threw, …). */
  failed: 502,
} as const

/** Navigation timeout: a page that cannot load in 15s is considered dead. */
export const NAV_TIMEOUT = 15_000
/** Upper bound for waiting on `networkidle`; timing out here is NOT an error. */
export const IDLE_TIMEOUT = 8_000
/** Extra settle time so client-side frameworks can render their links. */
export const RENDER_SETTLE = 500
/** Identifies the tool to site owners looking at their access logs. */
export const USER_AGENT = 'Mozilla/5.0 (compatible; SitemapBuilder/1.0)'

/** Collapse Playwright's verbose errors into a single line. */
function toMessage(error: unknown): string {
  if (error instanceof Error) return error.message.split('\n')[0].trim()
  return String(error)
}

/** Elapsed milliseconds since `startedAt`. */
function since(startedAt: number): number {
  return Math.round(performance.now() - startedAt)
}

/**
 * Open one page in a headless browser and extract its in-scope links.
 *
 * @returns The payload plus the HTTP status the route should reply with.
 */
export async function crawlPage(
  params: CrawlPageParams,
  deps: CrawlPageDeps = {},
): Promise<{
  status: (typeof CRAWL_STATUS)[keyof typeof CRAWL_STATUS]
  payload: CrawlResponsePayload
}> {
  const { url, origin, pathPrefix, stripQuery, signal } = params
  const resolveBrowser = deps.getBrowser ?? getSharedBrowser

  const startedAt = performance.now()
  let context: Awaited<ReturnType<Browser['newContext']>> | undefined
  let page: Awaited<ReturnType<Browser['newPage']>> | undefined

  try {
    const browser = await resolveBrowser()
    context = await browser.newContext({
      userAgent: USER_AGENT,
      viewport: { width: 1365, height: 900 },
      locale: 'zh-CN',
    })
    page = await context.newPage()
    page.setDefaultNavigationTimeout(NAV_TIMEOUT)

    // When the client aborts (user pressed stop), close the page right away
    // instead of waiting out the 15s navigation timeout.
    const onAbort = () => {
      if (page && !page.isClosed()) void page.close().catch(() => undefined)
    }
    signal?.addEventListener('abort', onAbort, { once: true })

    let httpStatus: number | null = null
    let lastModified: string | null = null
    let navigationError: string | undefined

    try {
      const response = await page.goto(url, {
        waitUntil: 'domcontentloaded',
        timeout: NAV_TIMEOUT,
      })
      if (response) {
        httpStatus = response.status()
        // The most reliable source for sitemap <lastmod>.
        lastModified = response.headers()['last-modified'] ?? null
      }
      // Do not fail on networkidle: SPAs, beacons and polling keep it busy forever.
      await page.waitForLoadState('networkidle', { timeout: IDLE_TIMEOUT }).catch(() => undefined)
      // Give client-side frameworks a moment to render their links.
      await page.waitForTimeout(RENDER_SETTLE)
    } catch (error) {
      // Timed out or failed to load: keep whatever did render and extract from it.
      navigationError = toMessage(error)
    }

    const extracted = await extractLinks(page, url, origin, pathPrefix, stripQuery)
    // On-page SEO snapshot. Runs in the page context (see seoDocument.ts) and is
    // best-effort: a failure must never fail the page. Playwright serializes the
    // function and calls it with no argument, so its optional parameter defaults to
    // the page's `document`; the cast only bridges Playwright's parameter typing.
    const collectSeo = collectSeoFromDocument as unknown as () => SeoSnapshot
    const seo = page.isClosed()
      ? undefined
      : await page.evaluate<SeoSnapshot>(collectSeo).catch((error: unknown) => {
          // Best-effort: loud enough to diagnose, but the page still succeeds. A
          // ReferenceError here means the collector picked up module-scope state,
          // which `page.evaluate` cannot serialize.
          // eslint-disable-next-line no-console
          console.warn('[seo] collection failed:', error instanceof Error ? error.message : String(error))
          return undefined
        })
    const pageTitle = page.isClosed() ? null : await page.title().catch(() => null)
    const finalUrl = page.isClosed() ? url : page.url()

    const payload: CrawlResponsePayload = {
      links: extracted.links,
      skippedLinks: extracted.skipped,
      pageUrl: url,
      finalUrl,
      pageTitle,
      httpStatus,
      lastModified,
      seo,
      durationMs: since(startedAt),
    }
    if (navigationError) payload.error = navigationError

    return {
      status: navigationError ? CRAWL_STATUS.partial : CRAWL_STATUS.ok,
      payload,
    }
  } catch (error) {
    // Reached when the browser itself fails (e.g. binary missing): still try the
    // page we managed to open, then report a gateway error.
    const fallback = page
      ? await extractLinks(page, url, origin, pathPrefix, stripQuery).catch(() => ({
          links: [] as string[],
          skipped: 0,
        }))
      : { links: [] as string[], skipped: 0 }

    return {
      status: CRAWL_STATUS.failed,
      payload: {
        links: fallback.links,
        skippedLinks: fallback.skipped,
        pageUrl: url,
        finalUrl: url,
        pageTitle: null,
        httpStatus: null,
        lastModified: null,
        durationMs: since(startedAt),
        error: toMessage(error),
      },
    }
  } finally {
    // Always release the context; it owns the page and its cookies.
    await context?.close().catch(() => undefined)
  }
}