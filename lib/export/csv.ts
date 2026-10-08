/**
 * CSV export for the crawl archive.
 *
 * Includes a UTF-8 BOM so Excel opens Chinese columns without mangling them.
 *
 * 抓取結果的 CSV 匯出。檔頭加上 UTF-8 BOM，避免 Excel 開啟中文欄位時亂碼。
 */
import { changefreqForDepth, priorityForDepth, resolveLastmod } from '@/lib/sitemap'
import type { UrlRecord } from '@/types/crawl'

/** Column headers, in output order. */
const CSV_HEADER = [
  'URL',
  '状态',
  'HTTP状态码',
  '页面标题',
  '深度',
  '来源页面',
  '发现链接数',
  '耗时(ms)',
  'lastmod',
  'Last-Modified响应头',
  '建议priority',
  '建议changefreq',
  '错误信息',
] as const

/** Human-readable status per record state. */
const STATUS_TEXT: Record<UrlRecord['status'], string> = {
  queued: '排队中',
  crawling: '抓取中',
  done: '已完成',
  failed: '失败',
}

/** Quote a single CSV cell, doubling embedded quotes. */
function csvCell(value: string | number | null | undefined): string {
  const text = value === null || value === undefined ? '' : String(value)
  return `"${text.replace(/"/g, '""')}"`
}

/**
 * Render records as CSV.
 *
 * @param records Archive in discovery order.
 * @returns CSV text including the BOM and CRLF line endings.
 */
export function buildCsv(records: readonly UrlRecord[]): string {
  const lines = [CSV_HEADER.map(csvCell).join(',')]

  for (const record of records) {
    lines.push(
      [
        record.url,
        STATUS_TEXT[record.status],
        record.httpStatus ?? '',
        record.pageTitle ?? '',
        record.depth,
        record.discoveredFrom ?? '',
        record.foundLinks,
        record.durationMs ?? '',
        resolveLastmod(record) ?? '',
        record.lastModified ?? '',
        priorityForDepth(record.depth).toFixed(1),
        changefreqForDepth(record.depth),
        record.error ?? '',
      ]
        .map(csvCell)
        .join(','),
    )
  }

  return `\uFEFF${lines.join('\r\n')}\r\n`
}