/**
 * HTTP layer for the crawl API.
 *
 * Isolated from the engine loop so tests can inject a fake, and so the (fairly
 * subtle) rules about partial successes live in one small place: a non-2xx
 * response that still carries links counts as a *partial success*.
 *
 * 抓取 API 的 HTTP 層。與引擎迴圈分離，讓測試可以注入假的實作，
 * 也讓「部分成功」這類細膩規則集中在一個小檔案裡：
 * 即使非 2xx，只要還帶得回連結，仍然算「部分成功」。
 */
import { crawlResponseSchema } from '@/lib/crawler/schema'
import type { CrawlRequest, CrawlResponsePayload } from '@/types/crawl'

/** Endpoint that performs one page fetch server-side. */
export const CRAWL_ENDPOINT = '/api/crawl'

/** Outcome of a single page request. */
export type CrawlPageResult =
  | { ok: true; response: CrawlResponsePayload }
  | { ok: false; message: string }

/**
 * Request one page from the server-side crawler.
 *
 * @param body   Target URL plus the origin/path scope to filter against.
 * @param signal Abort signal; aborting rejects with an `AbortError`.
 * @returns A partial success whenever links could be extracted, even if the page
 *          itself reported an error.
 */
export async function requestCrawlPage(
  body: CrawlRequest,
  signal: AbortSignal,
): Promise<CrawlPageResult> {
  const response = await fetch(CRAWL_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal,
  })

  const payload: unknown = await response.json().catch(() => undefined)
  const parsed = crawlResponseSchema.safeParse(payload)

  if (!parsed.success) {
    return {
      ok: false,
      message: `服务端返回了无法解析的响应（HTTP ${response.status}）`,
    }
  }

  const data = parsed.data

  if (response.ok) return { ok: true, response: data }

  // 206 / 4xx / 502 carrying links: the page loaded well enough to keep crawling.
  if (data.links.length > 0) return { ok: true, response: data }

  return { ok: false, message: data.error ?? `HTTP ${response.status}` }
}