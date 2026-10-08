/**
 * Plain-text log export.
 *
 * 純文字日誌匯出。
 */
import { formatLogMessage, type Locale } from '@/lib/i18n'
import type { LogEntry } from '@/types/crawl'

/** `HH:MM:SS.mmm` timestamp used in the exported file. */
function formatTime(ts: number): string {
  const date = new Date(ts)
  const pad = (value: number) => String(value).padStart(2, '0')
  return `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}.${String(
    date.getMilliseconds(),
  ).padStart(3, '0')}`
}

/**
 * Render log entries as text in the given locale.
 *
 * @param logs   Entries in chronological order.
 * @param locale Locale used to render each entry's message template.
 */
export function buildLogText(logs: readonly LogEntry[], locale: Locale): string {
  return logs
    .map(
      (entry) =>
        `${formatTime(entry.ts)} [${entry.level.toUpperCase().padEnd(7)}] ${formatLogMessage(
          locale,
          entry,
        )}`,
    )
    .join('\n')
}