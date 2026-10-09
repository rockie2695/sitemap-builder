/**
 * JSON export for the crawl archive.
 *
 * 抓取結果的 JSON 匯出。
 */
import { changefreqForDepth, resolveLastmod } from '@/lib/sitemap'
import type { SitemapExportOptions } from '@/lib/sitemap/entries'
import { resolvePriority } from '@/lib/sitemap/priority'
import { buildSeoReport } from '@/lib/seo/report'
import { contextFromReport, scorePage } from '@/lib/seo/score'
import { displayUrl } from '@/lib/sitemap/url-display'
import type { CrawlTaskMeta, UrlRecord } from '@/types/crawl'
import type { SerpRecord } from '@/types/serp'

/**
 * Render records as pretty-printed JSON with task metadata.
 *
 * The record's `url` field goes through the presentation pipeline, and each record
 * gains `suggested*` fields so downstream scripts can consume the same lastmod /
 * priority / changefreq values the sitemap exporter would write.
 *
 * @param records Archive in discovery order.
 * @param task    Start URL and scope, when a task exists.
 * @param options Field switches plus the URL/priority strategy context.
 * @param serp    Optional SERP records keyed by page URL (embedded per record).
 */
export function buildJson(
  records: readonly UrlRecord[],
  task: CrawlTaskMeta | null,
  options: SitemapExportOptions,
  serp: Readonly<Record<string, SerpRecord>> = {},
): string {
  const priorityContext = { strategy: options.priorityStrategy, pathPrefix: options.pathPrefix }
  const seoContext = contextFromReport(buildSeoReport(records))

  return `${JSON.stringify(
    {
      exportedAt: new Date().toISOString(),
      task,
      total: records.length,
      options,
      records: records.map((record) => ({
        ...record,
        /** Presentation-processed URL (host override / readable / final URL). */
        url: displayUrl(record, options),
        /** Same values the sitemap exporter would emit. */
        suggestedLastmod: resolveLastmod(record),
        suggestedPriority: resolvePriority(record, priorityContext),
        suggestedChangefreq: changefreqForDepth(record.depth),
        /** 0–100 on-page audit score (`null` when no snapshot was collected). */
        seoScore: scorePage(record, seoContext).score,
        /** SERP ranking data for this page, when a lookup has been run. */
        serp: serp[record.url] ?? null,
      })),
    },
    null,
    2,
  )}\n`
}