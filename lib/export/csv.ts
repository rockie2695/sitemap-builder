/**
 * CSV export for the crawl archive.
 *
 * Includes a UTF-8 BOM so Excel opens non-ASCII columns without mangling them.
 * URL cells go through the same `displayUrl` pipeline as the sitemap, so host
 * overrides and readable-URL switches apply here too.
 *
 * 抓取結果的 CSV 匯出。檔頭加上 UTF-8 BOM，避免 Excel 開啟非 ASCII 欄位時亂碼。
 * URL 欄位與 sitemap 走同一條 `displayUrl` 流程，因此主機替換與可讀 URL 開關同樣生效。
 */
import { changefreqForDepth, resolveLastmod } from '@/lib/sitemap'
import type { SitemapExportOptions } from '@/lib/sitemap/entries'
import { resolvePriority } from '@/lib/sitemap/priority'
import { buildSeoReport } from '@/lib/seo/report'
import { contextFromReport, scorePage } from '@/lib/seo/score'
import { displayUrl } from '@/lib/sitemap/url-display'
import type { UrlRecord } from '@/types/crawl'
import type { SerpRecord } from '@/types/serp'

/** Column headers, in output order. */
const CSV_HEADER = [
  'URL',
  'status',
  'httpStatus',
  'title',
  'depth',
  'pathDepth',
  'discoveredFrom',
  'foundLinks',
  'durationMs',
  'lastmod',
  'lastModifiedHeader',
  'suggestedPriority',
  'suggestedChangefreq',
  'seoScore',
  'seoTitleLength',
  'seoDescriptionLength',
  'seoH1Count',
  'seoImagesMissingAlt',
  'seoWordCount',
  'seoIndexable',
  'serpQuery',
  'serpRank',
  'serpTopHost',
  'serpCompetitors',
  'error',
] as const

/** Quote a single CSV cell, doubling embedded quotes. */
function csvCell(value: string | number | null | undefined): string {
  const text = value === null || value === undefined ? '' : String(value)
  return `"${text.replace(/"/g, '""')}"`
}

/** Non-empty path segment count, mirroring `pathDepthOf` for the report column. */
function pathDepthColumn(url: string): number {
  try {
    return new URL(url).pathname.split('/').filter(Boolean).length
  } catch {
    return 0
  }
}

/**
 * Render records as CSV.
 *
 * @param records Archive in discovery order.
 * @param options Field switches plus the URL/priority strategy context.
 * @param serp    Optional SERP records keyed by page URL (adds ranking columns).
 * @returns CSV text including the BOM and CRLF line endings.
 */
export function buildCsv(
  records: readonly UrlRecord[],
  options: SitemapExportOptions,
  serp: Readonly<Record<string, SerpRecord>> = {},
): string {
  const lines = [CSV_HEADER.map(csvCell).join(',')]
  const priorityContext = { strategy: options.priorityStrategy, pathPrefix: options.pathPrefix }
  // SEO columns need the site-wide duplicate sets, so the report is built here.
  const seoContext = contextFromReport(buildSeoReport(records))

  for (const record of records) {
    lines.push(
      [
        displayUrl(record, options),
        record.status,
        record.httpStatus ?? '',
        record.pageTitle ?? '',
        record.depth,
        pathDepthColumn(record.url),
        record.discoveredFrom ?? '',
        record.foundLinks,
        record.durationMs ?? '',
        resolveLastmod(record) ?? '',
        record.lastModified ?? '',
        resolvePriority(record, priorityContext).toFixed(1),
        changefreqForDepth(record.depth),
        scorePage(record, seoContext).score ?? '',
        record.seo?.titleLength ?? '',
        record.seo?.metaDescriptionLength ?? '',
        record.seo?.h1.length ?? '',
        record.seo?.images.missingAlt ?? '',
        record.seo?.wordCount ?? '',
        record.seo === undefined ? '' : record.seo.indexable ? 'true' : 'false',
        serp[record.url]?.query ?? '',
        serp[record.url]?.rank ?? '',
        serp[record.url]?.results[0]?.hostname ?? '',
        serp[record.url]?.competitors.length ?? '',
        record.error ?? '',
      ]
        .map(csvCell)
        .join(','),
    )
  }

  return `\uFEFF${lines.join('\r\n')}\r\n`
}