/**
 * Turning crawl records into sitemap entries.
 *
 * 把抓取結果轉換為 sitemap 項目。
 */
import type { Changefreq, CrawlOptions, UrlRecord } from '@/types/crawl'

import { resolveChangefreq } from './changefreq'
import { priorityForDepth } from './priority'

/** One `<url>` block; `null`/`undefined` fields are omitted from the XML. */
export interface SitemapEntry {
  /** Canonical absolute URL. */
  url: string
  /** W3C date-time, e.g. `2026-10-07T06:11:16+00:00`. */
  lastmod?: string | null
  /** Suggested crawl frequency. */
  changefreq?: Changefreq | null
  /** Relative priority between `0.0` and `1.0`. */
  priority?: number | null
}

/** The subset of crawl options that only affects exported output. */
export type SitemapExportOptions = Pick<
  CrawlOptions,
  'includeLastmod' | 'includePriority' | 'includeChangefreq' | 'changefreq'
>

/**
 * Format a date the way sitemaps.org expects (W3C date-time with a timezone).
 *
 * @param date Date to format.
 */
export function formatW3CDateTime(date: Date): string {
  return date.toISOString().replace(/\.\d{3}Z$/, '+00:00')
}

/**
 * Decide the `<lastmod>` value for a record.
 *
 * The page's own `Last-Modified` header is the honest answer; when a site omits it
 * we fall back to the moment we finished fetching, which is what most crawlers do.
 *
 * @param record Archive entry.
 * @returns W3C date-time, or `null` when neither source is available.
 */
export function resolveLastmod(record: UrlRecord): string | null {
  if (record.lastModified) {
    const parsed = new Date(record.lastModified)
    if (!Number.isNaN(parsed.getTime())) return formatW3CDateTime(parsed)
  }
  if (record.finishedAt !== null) return formatW3CDateTime(new Date(record.finishedAt))
  return null
}

/**
 * Convert the archive into sitemap entries, honouring the field switches.
 *
 * @param records Archive in discovery order.
 * @param options Which optional fields to emit.
 */
export function toSitemapEntries(
  records: readonly UrlRecord[],
  options: SitemapExportOptions,
): SitemapEntry[] {
  const { includeLastmod, includePriority, includeChangefreq, changefreq } = options

  return records.map((record) => ({
    url: record.url,
    lastmod: includeLastmod ? resolveLastmod(record) : undefined,
    changefreq: includeChangefreq ? resolveChangefreq(changefreq, record.depth) : undefined,
    priority: includePriority ? priorityForDepth(record.depth) : undefined,
  }))
}