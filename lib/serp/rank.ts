/**
 * SERP helpers: host normalization and rank lookup.
 *
 * 搜尋結果輔助：主機正規化與排名查找。
 */
import type { SerpResult } from '@/types/serp'

/**
 * Normalize a hostname for comparisons (`www.` prefix removed, lower-cased).
 *
 * @param hostname Raw hostname.
 */
export function normalizeHost(hostname: string): string {
  return hostname.toLowerCase().replace(/^www\./, '')
}

/**
 * Whether a result belongs to a given URL's site (host comparison only).
 *
 * Comparing hosts rather than full paths is deliberate: search engines frequently
 * rank a different page of the same site, which is still "our site ranking".
 *
 * @param result        One organic result.
 * @param targetUrl     Our page.
 */
export function isSameSite(result: SerpResult, targetUrl: string): boolean {
  try {
    return normalizeHost(new URL(targetUrl).hostname) === normalizeHost(result.hostname)
  } catch {
    return false
  }
}

/**
 * Our position in the organic list.
 *
 * @param results   Parsed results, ordered by position.
 * @param targetUrl Our page.
 * @returns The 1-based position, or `null` when our site is not in the results.
 */
export function findRank(results: readonly SerpResult[], targetUrl: string): number | null {
  const match = results.find((result) => isSameSite(result, targetUrl))
  return match ? match.position : null
}

/**
 * Drop duplicate URLs and renumber positions 1..n.
 *
 * @param results Possibly duplicated results.
 */
export function dedupeResults(results: readonly SerpResult[]): SerpResult[] {
  const seen = new Set<string>()
  const unique: SerpResult[] = []

  for (const result of results) {
    if (seen.has(result.url)) continue
    seen.add(result.url)
    unique.push({ ...result, position: unique.length + 1 })
  }
  return unique
}

/**
 * Pick the competitors worth analysing: the top results that are not our own site.
 *
 * @param results   Organic results.
 * @param targetUrl Our page.
 * @param limit     Maximum number of competitors.
 */
export function pickCompetitors(
  results: readonly SerpResult[],
  targetUrl: string,
  limit: number,
): SerpResult[] {
  if (limit <= 0) return []
  return results.filter((result) => !isSameSite(result, targetUrl)).slice(0, limit)
}