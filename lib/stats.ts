/**
 * Derived statistics: every number the UI shows is computed from
 * `records + runtime + history`, never stored twice.
 *
 * 衍生統計：介面上的每個數字都由 `records + runtime + history` 推導，不做冗餘儲存。
 */
import type { CrawlRuntimeStats, HistoryPoint, UrlRecord } from '@/types/crawl'

/** Everything the stat cards and progress bar render. */
export interface DerivedStats {
  /** Discovered pages (all of them belong in the sitemap). */
  addedToSitemap: number
  /** Waiting in the engine queue. */
  pending: number
  /** Currently being fetched. */
  crawling: number
  /** Fetched successfully. */
  done: number
  /** Failed (transport error or a 4xx/5xx page). */
  failed: number
  /** Skipped because they are not HTML documents. */
  skipped: number
  /** done + failed. */
  processed: number
  /** Progress 0–100. */
  progressPct: number
  /** Success rate 0–100. */
  successRate: number
  /** Total task duration in ms. */
  elapsedMs: number
  /** Average duration per successful page, in ms. */
  avgMs: number
  /** Throughput in pages/minute (recent 60s samples preferred). */
  perMinute: number
}

/**
 * Compute the derived stats.
 *
 * @param records URL archive.
 * @param runtime Raw counters maintained by the engine.
 * @param now     Current timestamp.
 * @param pending The engine's queue length.
 * @param history Throughput samples.
 */
export function computeStats(
  records: ReadonlyMap<string, UrlRecord>,
  runtime: CrawlRuntimeStats,
  now: number,
  pending: number,
  history: readonly HistoryPoint[],
): DerivedStats {
  // One allocation-free pass over the archive.
  let crawling = 0
  let done = 0
  let failed = 0
  let doneDurationSum = 0

  for (const record of records.values()) {
    if (record.status === 'crawling') crawling += 1
    else if (record.status === 'done') {
      done += 1
      doneDurationSum += record.durationMs ?? 0
    } else if (record.status === 'failed') failed += 1
  }

  const total = records.size
  const processed = done + failed
  const handled = processed + pending + crawling

  const elapsedMs =
    runtime.startedAt === null ? 0 : Math.max(0, (runtime.finishedAt ?? now) - runtime.startedAt)

  // Throughput: prefer the recent 60s of samples so the start-up spike does not skew it.
  let perMinute = 0
  const recent = history.filter((point) => point.t >= now - 60_000)
  if (recent.length >= 2) {
    const first = recent[0]
    const last = recent[recent.length - 1]
    const span = last.t - first.t
    if (span > 3_000) perMinute = ((last.done - first.done) / span) * 60_000
  }
  if (perMinute === 0 && elapsedMs > 5_000 && done > 0) {
    perMinute = (done / elapsedMs) * 60_000
  }

  return {
    addedToSitemap: total,
    pending,
    crawling,
    done,
    failed,
    skipped: runtime.skippedLinks,
    processed,
    progressPct: handled === 0 ? 0 : Math.round((processed / handled) * 100),
    successRate: processed === 0 ? 100 : Math.round((done / processed) * 1000) / 10,
    elapsedMs,
    avgMs: done === 0 ? 0 : Math.round(doneDurationSum / done),
    perMinute: Math.round(perMinute * 10) / 10,
  }
}

/**
 * Format milliseconds as `1.2s` / `3m 12s` / `1h 30m`.
 *
 * @param ms Duration in milliseconds; non-positive renders as an em dash.
 */
export function formatDuration(ms: number): string {
  if (!Number.isFinite(ms) || ms <= 0) return '—'
  if (ms < 1000) return `${Math.round(ms)}ms`
  const seconds = ms / 1000
  if (seconds < 60) return `${seconds.toFixed(1)}s`
  const minutes = Math.floor(seconds / 60)
  const rest = Math.round(seconds % 60)
  if (minutes < 60) return `${minutes}m ${rest}s`
  const hours = Math.floor(minutes / 60)
  return `${hours}h ${minutes % 60}m`
}

/**
 * Format a timestamp as `HH:MM:SS`.
 *
 * @param ts Millisecond timestamp.
 */
export function formatClock(ts: number): string {
  const date = new Date(ts)
  const pad = (value: number) => String(value).padStart(2, '0')
  return `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
}