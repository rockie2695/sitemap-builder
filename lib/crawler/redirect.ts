/**
 * Redirect detection.
 *
 * A crawl follows redirects (`page.goto`), so a record can end up describing a page
 * other than the one requested. Some sitemap owners want those entries dropped rather
 * than exporting an address that immediately bounces elsewhere.
 *
 * Comparison reuses the same normalization as discovered links (trailing slash, query
 * policy), so `/a` → `/a/` or a stripped `?utm=…` is **not** treated as a redirect.
 *
 * 重定向判定。
 * 抓取會跟隨重定向，因此某筆記錄描述的頁面可能不是當初請求的位址。
 * 部分站長希望把這類項目排除，而不是匯出一個會立刻跳轉的位址。
 * 比較沿用與連結相同的規範化（末尾斜線、查詢策略），
 * 因此 `/a` → `/a/` 或被剔除的 `?utm=…` **不會**被視為重定向。
 */
import { isSameUrl } from '@/lib/url-utils'
import type { UrlRecord } from '@/types/crawl'

/**
 * Whether a fetch ended on a different URL than the one requested.
 *
 * @param url        The address that was requested.
 * @param finalUrl   The address after redirects (may be null when unavailable).
 * @param stripQuery Query policy used during the crawl.
 *
 * @example
 * isRedirected('https://x.test/a', 'https://x.test/b', true)  // true
 * isRedirected('https://x.test/a', 'https://x.test/a/', true) // false
 * isRedirected('https://x.test/a', null, true)                // false
 */
export function isRedirected(
  url: string,
  finalUrl: string | null | undefined,
  stripQuery: boolean,
): boolean {
  if (!finalUrl) return false
  return !isSameUrl(url, finalUrl, { stripQuery })
}

/**
 * Whether a record should be left out of the exports.
 *
 * @param record  Archive entry.
 * @param options The two exclusion switches.
 */
export function shouldExcludeFromExport(
  record: Pick<UrlRecord, 'status' | 'redirected'>,
  options: { excludeFailed: boolean; excludeRedirected: boolean },
): boolean {
  if (options.excludeFailed && record.status === 'failed') return true
  if (options.excludeRedirected && record.redirected) return true
  return false
}