/**
 * Query derivation: turn our own pages into search queries.
 *
 * One query per **successfully crawled** page ("base on each our sitemap webpage"),
 * taken from the H1 when the page has one (the cleanest topic statement), otherwise the
 * title. Failed pages (404/5xx and transport errors) are skipped — a page that does not
 * exist has no ranking to track. Pages are **not** collapsed: the SERP list mirrors the
 * audit, one row per page. Identical queries are de-duplicated at *run* time instead
 * (the engine fetches a repeated query once and reuses the result), so a big site stays
 * cheap without hiding pages.
 *
 * Queries are ordered worst-SEO-score-first by default, because those are the pages you
 * actually want to fix.
 *
 * 查詢推導：把我們自己的頁面轉成搜尋查詢。每個**成功抓取**的頁面一個查詢
 * （依每個 sitemap 頁面），優先取 H1（通常最精煉），其次標題。失敗頁（404/5xx 與連線錯誤）
 * 會略過——不存在的頁面沒有排名可追。這裡**不**合併頁面：SERP 清單會與稽核一致，每頁一列。
 * 相同的查詢改在**執行**時去重（引擎對重複查詢只抓一次並重用結果），
 * 因此大型網站依然省成本，又不會隱藏頁面。預設以「SEO 分數最低者優先」排序。
 */
import type { UrlRecord } from '@/types/crawl'
import { SERP_MAX_DERIVED_QUERIES, type SerpQuery } from '@/types/serp'

/** Options for {@link deriveQueries}. */
export interface DeriveQueriesOptions {
  /** Safety cap on the returned list (clamped to `[1, SERP_MAX_DERIVED_QUERIES]`). */
  limit?: number
  /** SEO score per URL; lower scores are queried first. */
  scores?: ReadonlyMap<string, number | null>
}

/** Collapse whitespace and trim trailing separators so the text reads as a query. */
function toQueryText(value: string): string {
  return value
    .replace(/\s+/g, ' ')
    .replace(/\s*[|·—–-]\s*$/, '')
    .trim()
}

/**
 * Build the query list — one entry per successfully crawled page.
 *
 * @param records Crawled pages (failed pages and records without a snapshot are ignored).
 * @param options Optional scores and a safety cap.
 */
export function deriveQueries(
  records: readonly UrlRecord[],
  options: DeriveQueriesOptions = {},
): SerpQuery[] {
  const limit = Math.min(
    Math.max(1, options.limit ?? SERP_MAX_DERIVED_QUERIES),
    SERP_MAX_DERIVED_QUERIES,
  )
  const candidates: Array<SerpQuery & { score: number }> = []

  for (const record of records) {
    // Only successfully crawled pages: a 404/5xx or transport failure has nothing to rank.
    if (record.status !== 'done') continue
    if (!record.seo) continue

    const source = record.seo.h1[0] || record.seo.title || record.seo.keywords[0]?.term || ''
    const query = toQueryText(source).slice(0, 120)
    if (query.length < 2) continue

    candidates.push({
      query,
      url: record.url,
      // Unknown scores sort last.
      score: options.scores?.get(record.url) ?? 101,
    })
  }

  candidates.sort((a, b) => a.score - b.score)

  return candidates.slice(0, limit).map(({ query, url }) => ({ query, url }))
}