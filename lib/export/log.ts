/**
 * Plain-text log export.
 *
 * 純文字日誌匯出。
 */
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
 * Render log entries as text.
 *
 * @param logs Entries in chronological order.
 */
export function buildLogText(logs: readonly LogEntry[]): string {
  return logs
    .map((entry) => `${formatTime(entry.ts)} [${entry.level.toUpperCase().padEnd(7)}] ${entry.message}`)
    .join('\n')
}