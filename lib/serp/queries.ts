/**
 * Query derivation: turn our own pages into search queries.
 *
 * One query per page ("base on each our sitemap webpage"), taken from the H1 when the
 * page has one (usually the cleanest topic statement), otherwise the title. Queries
 * are de-duplicated and normally ordered worst-SEO-score-first, because those are the
 * pages you actually want to fix.
 *
 * 查詢推導：把我們自己的頁面轉成搜尋查詢。每頁一個查詢（依每個 sitemap 頁面），
 * 優先取 H1（通常最精煉），其次標題。查詢會去重，預設以「SEO 分數最低者優先」排序，
 * 因為那才是真正想修的地方。
 */
import type { UrlRecord } from '@/types/crawl'
import { SERP_DEFAULT_MAX_QUERIES, SERP_MAX_QUERIES, type SerpQuery } from '@/types/serp'

/** Options for {@link deriveQueries}. */
export interface DeriveQueriesOptions {
  /** Maximum number of queries (clamped to `[1, SERP_MAX_QUERIES]`). */
  maxQueries?: number
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
 * Build the query list.
 *
 * @param records Audited pages (records without a snapshot are ignored).
 * @param options Cap and optional scores.
 */
export function deriveQueries(
  records: readonly UrlRecord[],
  options: DeriveQueriesOptions = {},
): SerpQuery[] {
  const maxQueries = Math.min(Math.max(1, options.maxQueries ?? SERP_DEFAULT_MAX_QUERIES), SERP_MAX_QUERIES)
  const seen = new Set<string>()
  const candidates: Array<SerpQuery & { score: number }> = []

  for (const record of records) {
    if (!record.seo) continue

    const source = record.seo.h1[0] || record.seo.title || record.seo.keywords[0]?.term || ''
    const query = toQueryText(source).slice(0, 120)
    if (query.length < 2) continue

    const key = query.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)

    candidates.push({
      query,
      url: record.url,
      // Unknown scores sort last.
      score: options.scores?.get(record.url) ?? 101,
    })
  }

  candidates.sort((a, b) => a.score - b.score)

  return candidates.slice(0, maxQueries).map(({ query, url }) => ({ query, url }))
}