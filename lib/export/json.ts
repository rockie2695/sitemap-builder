/**
 * JSON export for the crawl archive.
 *
 * 抓取結果的 JSON 匯出。
 */
import { changefreqForDepth, resolveLastmod } from '@/lib/sitemap'
import type { SitemapExportOptions } from '@/lib/sitemap/entries'
import { resolvePriority } from '@/lib/sitemap/priority'
import { displayUrl } from '@/lib/sitemap/url-display'
import type { CrawlTaskMeta, UrlRecord } from '@/types/crawl'

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
 */
export function buildJson(
  records: readonly UrlRecord[],
  task: CrawlTaskMeta | null,
  options: SitemapExportOptions,
): string {
  const priorityContext = { strategy: options.priorityStrategy, pathPrefix: options.pathPrefix }

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
      })),
    },
    null,
    2,
  )}\n`
}