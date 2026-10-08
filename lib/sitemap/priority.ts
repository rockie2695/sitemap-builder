/**
 * `<priority>` derivation.
 *
 * Priority is a *relative* hint inside one sitemap, so a ladder derived from a depth
 * measure is the most defensible automatic heuristic. Three strategies are offered:
 *
 * - `linkDepth`          — hops from the start page (record.depth)
 * - `pathDepth`          — URL path segments, absolute (`/a/b/c` = 3)
 * - `relativePathDepth`  — path segments below the start URL's prefix
 *
 * `<priority>` 推導。priority 是單一 sitemap 內的相對提示，
 * 因此以深度分層最合理。提供三種策略：
 * - `linkDepth`：距起始頁的連結層數（record.depth）
 * - `pathDepth`：URL 路徑段數（絕對，`/a/b/c` = 3）
 * - `relativePathDepth`：相對於起始網址前綴的路徑段數
 */
import type { PriorityStrategy, UrlRecord } from '@/types/crawl'

/** Priority per ladder step; deeper entries fall back to {@link FALLBACK_PRIORITY}. */
const LADDER = [1, 0.8, 0.6, 0.4] as const

/** Priority used past the ladder (and for invalid input). */
export const FALLBACK_PRIORITY = 0.2

/**
 * Map a depth onto the ladder.
 *
 * @param depth Non-negative ladder position (0 = most important).
 * @returns A value in `[0.2, 1]` with a single decimal step.
 *
 * @example
 * priorityForDepth(0) // 1
 * priorityForDepth(2) // 0.6
 * priorityForDepth(9) // 0.2
 */
export function priorityForDepth(depth: number): number {
  if (!Number.isFinite(depth) || depth < 0) return FALLBACK_PRIORITY
  return LADDER[Math.floor(depth)] ?? FALLBACK_PRIORITY
}

/**
 * Number of path segments in a URL, counted as-is.
 *
 * The query string is ignored, a trailing slash adds nothing, and the last segment
 * keeps any file extension (`/a/b.html` = 2).
 *
 * @param url Absolute URL.
 *
 * @example
 * pathDepthOf('https://example.com/')      // 0
 * pathDepthOf('https://example.com/a/b/c') // 3
 */
export function pathDepthOf(url: string): number {
  let pathname: string
  try {
    pathname = new URL(url).pathname
  } catch {
    return 0
  }
  return segmentsOf(pathname).length
}

/**
 * Path segments below the crawl's path prefix.
 *
 * The start page itself is 0. URLs outside the prefix fall back to the absolute
 * depth, which keeps the function total even for odd inputs.
 *
 * @param url        Absolute URL.
 * @param pathPrefix Scope prefix, e.g. `/test` (empty = whole origin).
 *
 * @example
 * relativePathDepthOf('https://example.com/test/a', '/test') // 1
 */
export function relativePathDepthOf(url: string, pathPrefix: string): number {
  const absolute = pathDepthOf(url)
  if (!pathPrefix) return absolute

  let pathname: string
  try {
    pathname = new URL(url).pathname
  } catch {
    return absolute
  }

  const prefixSegments = segmentsOf(pathPrefix).length
  const urlSegments = segmentsOf(pathname)
  if (urlSegments.length < prefixSegments) return absolute

  // Only treat it as relative when the prefix really is a prefix.
  for (let i = 0; i < prefixSegments; i += 1) {
    if (urlSegments[i] !== segmentsOf(pathPrefix)[i]) return absolute
  }
  return urlSegments.length - prefixSegments
}

/** Split a pathname into its non-empty segments. */
function segmentsOf(pathname: string): string[] {
  return pathname.split('/').filter((segment) => segment.length > 0)
}

/** Context needed to resolve a priority value. */
export interface PriorityContext {
  /** Selected strategy. */
  strategy: PriorityStrategy
  /** The task's path prefix, used by `relativePathDepth`. */
  pathPrefix: string
}

/**
 * Resolve the priority for one record using the selected strategy.
 *
 * This is the single entry point used by the sitemap, CSV and JSON exporters so all
 * three always agree.
 *
 * @param record Archive entry (only `url` and `depth` are read).
 * @param context Strategy plus the task's path prefix.
 */
export function resolvePriority(record: Pick<UrlRecord, 'url' | 'depth'>, context: PriorityContext): number {
  switch (context.strategy) {
    case 'pathDepth':
      // `/` and `/a` both count as the top level, so the homepage is never 0.2.
      return priorityForDepth(Math.max(0, pathDepthOf(record.url) - 1))
    case 'relativePathDepth':
      return priorityForDepth(relativePathDepthOf(record.url, context.pathPrefix))
    case 'linkDepth':
    default:
      return priorityForDepth(record.depth)
  }
}

/** Default context used when a caller does not care about the strategy. */
export const DEFAULT_PRIORITY_CONTEXT: PriorityContext = {
  strategy: 'linkDepth',
  pathPrefix: '',
}