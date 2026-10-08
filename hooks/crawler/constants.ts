/**
 * Tunable limits and default options for the crawl engine.
 *
 * Everything here is a pure constant: the UI exposes the three `CrawlOptions`
 * fields, while the remaining limits are safety valves that keep a runaway
 * crawl from exhausting memory.
 *
 * 抓取引擎的可調上限與預設選項。此檔案只含純常數：`CrawlOptions` 的三個欄位由介面
 * 暴露，其餘則是防止記憶體被撐爆的安全閥值。
 */
import type { CrawlOptions } from '@/types/crawl'

/** Consecutive transport failures before the crawl auto-pauses. */
export const MAX_CONSECUTIVE_ERRORS = 5

/** Ring-buffer cap for the in-memory log panel. */
export const LOG_LIMIT = 5_000

/** Cap for throughput chart samples (1 hour at one sample per second). */
export const HISTORY_LIMIT = 3_600

/** Highest accepted concurrency (each worker is a browser context ≈150MB). */
export const MAX_CONCURRENCY = 5

/** Highest accepted retry count per page. */
export const MAX_RETRIES = 5

/** How often the engine samples throughput / refreshes the elapsed timer. */
export const SAMPLE_INTERVAL_MS = 1_000

/** Poll interval used while waiting inside the paused state. */
export const PAUSE_POLL_MS = 150

/** Debounce before writing the resume snapshot to localStorage. */
export const PERSIST_DEBOUNCE_MS = 800

/** Default crawl options; also used to backfill fields missing from old snapshots. */
export const DEFAULT_OPTIONS: CrawlOptions = {
  /** Strip every query string by default — query-heavy URLs explode the URL count. */
  stripQuery: true,
  /** Hard cap on crawled pages; reaching it stops the task. */
  maxPages: 1000,
  /** Politeness delay between two request starts, in milliseconds. */
  delayMs: 800,
  /** Sequential by default: one request at a time. */
  concurrency: 1,
  /** No retries by default. */
  retryCount: 0,
  /** Emit <lastmod> in sitemap.xml (from Last-Modified header, else crawl time). */
  includeLastmod: true,
  /** Emit <priority> in sitemap.xml (derived from link depth). */
  includePriority: false,
  /** Link depth is the most intuitive default ladder. */
  priorityStrategy: 'linkDepth',
  /** Emit <changefreq> in sitemap.xml. */
  includeChangefreq: false,
  /** "auto" derives changefreq from depth; otherwise the literal value is used. */
  changefreq: 'auto',
  /** Keep failed pages out of the exported sitemap. */
  excludeFailed: false,
  /** Split the export into several sitemap files when it grows past the limit. */
  splitSitemaps: false,
  /** URLs per generated sitemap file. */
  maxUrlsPerFile: 1000,
  /** Percent-encoded URLs by default (what search engines expect). */
  readableUrls: false,
  /** Export the requested URL by default. */
  useFinalUrl: false,
  /** No host rewriting by default. */
  exportHostOverride: '',
}