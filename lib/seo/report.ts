/**
 * Site-wide SEO report: problems that only make sense across pages.
 *
 * 全站 SEO 報告：只有在跨頁面時才有意義的問題。
 */
import type { SeoReport } from '@/types/seo'
import { THIN_CONTENT_WORDS } from '@/types/seo'
import type { UrlRecord } from '@/types/crawl'

/** Group pages by a string field, keeping only groups with more than one page. */
function duplicateGroups(
  records: readonly UrlRecord[],
  pick: (record: UrlRecord) => string | null | undefined,
): Array<{ value: string; urls: string[] }> {
  const groups = new Map<string, string[]>()

  for (const record of records) {
    if (!record.seo) continue
    const value = pick(record)?.trim()
    if (!value) continue
    const urls = groups.get(value)
    if (urls) urls.push(record.url)
    else groups.set(value, [record.url])
  }

  return [...groups.entries()]
    .filter(([, urls]) => urls.length > 1)
    .map(([value, urls]) => ({ value, urls }))
    .sort((a, b) => b.urls.length - a.urls.length)
}

/**
 * Build the site-wide report.
 *
 * Only pages that were fetched successfully carry a snapshot; the rest are ignored so
 * "missing title" is not reported for a page that failed to load.
 *
 * @param records The crawl archive.
 */
export function buildSeoReport(records: readonly UrlRecord[]): SeoReport {
  const audited = records.filter((record) => Boolean(record.seo))

  return {
    duplicateTitles: duplicateGroups(audited, (record) => record.seo?.title),
    duplicateDescriptions: duplicateGroups(audited, (record) => record.seo?.metaDescription),
    missingTitle: audited.filter((record) => !record.seo?.title).map((record) => record.url),
    missingDescription: audited
      .filter((record) => !record.seo?.metaDescription)
      .map((record) => record.url),
    multipleH1: audited
      .filter((record) => (record.seo?.h1.length ?? 0) > 1)
      .map((record) => record.url),
    notIndexable: audited.filter((record) => record.seo && !record.seo.indexable).map((record) => record.url),
    thinContent: audited
      .filter((record) => (record.seo?.wordCount ?? 0) < THIN_CONTENT_WORDS)
      .map((record) => record.url),
    canonicalMismatch: audited
      .filter((record) => {
        const canonical = record.seo?.canonical
        if (!canonical) return false
        // Compare loosely: a trailing slash or a stripped query is not a mismatch.
        const normalize = (value: string): string => {
          try {
            const parsed = new URL(value)
            return `${parsed.origin}${parsed.pathname.replace(/\/+$/, '') || '/'}`
          } catch {
            return value
          }
        }
        return normalize(canonical) !== normalize(record.url)
      })
      .map((record) => record.url),
  }
}

/** Total number of pages mentioned across every issue list (with duplicates). */
export function countReportFindings(report: SeoReport): number {
  return (
    report.duplicateTitles.reduce((sum, group) => sum + group.urls.length, 0) +
    report.duplicateDescriptions.reduce((sum, group) => sum + group.urls.length, 0) +
    report.missingTitle.length +
    report.missingDescription.length +
    report.multipleH1.length +
    report.notIndexable.length +
    report.thinContent.length +
    report.canonicalMismatch.length
  )
}