/**
 * `<priority>` derivation.
 *
 * Priority is a *relative* hint inside one sitemap, so a depth-based ladder is the
 * most defensible automatic heuristic: pages closer to the start URL are usually
 * the more important ones.
 *
 * `<priority>` 推導。priority 是單一 sitemap 內的相對提示，
 * 因此以深度分層是最合理的自動策略：越靠近起始網址的頁面通常越重要。
 */

/** Priority per link depth; deeper pages fall back to {@link FALLBACK_PRIORITY}. */
const DEPTH_PRIORITY = [1, 0.8, 0.6, 0.4] as const

/** Priority used from depth 4 onwards (and for invalid input). */
export const FALLBACK_PRIORITY = 0.2

/**
 * Priority for a given link depth.
 *
 * @param depth Link distance from the start page (0 = start page).
 * @returns A value in `[0.2, 1]` with a single decimal step.
 *
 * @example
 * priorityForDepth(0) // 1
 * priorityForDepth(2) // 0.6
 * priorityForDepth(9) // 0.2
 */
export function priorityForDepth(depth: number): number {
  if (!Number.isFinite(depth) || depth < 0) return FALLBACK_PRIORITY
  return DEPTH_PRIORITY[Math.floor(depth)] ?? FALLBACK_PRIORITY
}