/**
 * JSON export for the crawl archive.
 *
 * 抓取結果的 JSON 匯出。
 */
import { changefreqForDepth, priorityForDepth, resolveLastmod } from '@/lib/sitemap'
import type { CrawlTaskMeta, UrlRecord } from '@/types/crawl'

/**
 * Render records as pretty-printed JSON with task metadata.
 *
 * Each record gains `suggested*` fields so downstream scripts can consume the same
 * lastmod / priority / changefreq values the sitemap exporter would write.
 *
 * @param records Archive in discovery order.
 * @param task    Start URL and scope, when a task exists.
 */
export function buildJson(records: readonly UrlRecord[], task: CrawlTaskMeta | null): string {
  return `${JSON.stringify(
    {
      exportedAt: new Date().toISOString(),
      task,
      total: records.length,
      records: records.map((record) => ({
        ...record,
        /** Same values the sitemap exporter would emit. */
        suggestedLastmod: resolveLastmod(record),
        suggestedPriority: priorityForDepth(record.depth),
        suggestedChangefreq: changefreqForDepth(record.depth),
      })),
    },
    null,
    2,
  )}\n`
}