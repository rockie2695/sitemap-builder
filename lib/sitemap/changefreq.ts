/**
 * `<changefreq>` resolution.
 *
 * 變更頻率解析。
 */
import type { Changefreq, ChangefreqSetting } from '@/types/crawl'

/** Auto-derived frequency per link depth. */
const DEPTH_CHANGEFREQ: Changefreq[] = ['daily', 'weekly', 'monthly', 'yearly']

/**
 * Frequency suggested for a given link depth.
 *
 * @param depth Link distance from the start page (0 = start page).
 *
 * @example
 * changefreqForDepth(0) // 'daily'
 * changefreqForDepth(3) // 'yearly'
 */
export function changefreqForDepth(depth: number): Changefreq {
  const index = Number.isFinite(depth) && depth > 0 ? Math.floor(depth) : 0
  return DEPTH_CHANGEFREQ[Math.min(index, DEPTH_CHANGEFREQ.length - 1)]
}

/**
 * Turn the user's setting into a concrete frequency.
 *
 * @param setting `'auto'` derives from depth; any literal value is used as-is.
 * @param depth   Link distance from the start page.
 */
export function resolveChangefreq(setting: ChangefreqSetting, depth: number): Changefreq {
  return setting === 'auto' ? changefreqForDepth(depth) : setting
}

/** Options rendered by the changefreq dropdown in the export bar. */
export const CHANGEFREQ_OPTIONS: ReadonlyArray<{
  value: ChangefreqSetting
  label: string
}> = [
  { value: 'auto', label: '按深度自动' },
  { value: 'always', label: 'always' },
  { value: 'hourly', label: 'hourly' },
  { value: 'daily', label: 'daily' },
  { value: 'weekly', label: 'weekly' },
  { value: 'monthly', label: 'monthly' },
  { value: 'yearly', label: 'yearly' },
  { value: 'never', label: 'never' },
]