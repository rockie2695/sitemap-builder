/**
 * Domain types shared by the client and the server.
 *
 * The API contract types are inferred from the zod schemas in
 * `lib/crawler/schema.ts` — the single source of truth for the wire format.
 *
 * 前後端共用的領域型別。API 契約型別由 `lib/crawler/schema.ts` 的 zod schema 推導，
 * schema 是傳輸格式的唯一真相來源。
 */

/** i18n key/params referenced by log entries. */
import type { LogMessageKey, MessageParams } from '@/lib/i18n/types'

/** Status of one URL in the crawl flow. */
export type UrlStatus = 'queued' | 'crawling' | 'done' | 'failed'

/** Log severity. */
export type LogLevel = 'info' | 'success' | 'warn' | 'error'

/** Overall task phase. */
export type Phase = 'idle' | 'running' | 'paused' | 'stopped' | 'done'

/** One URL's full record. */
export interface UrlRecord {
  url: string
  status: UrlStatus
  /** Link distance from the start page; the start page is 0. */
  depth: number
  /** The page this URL was found on (empty for the start page). */
  discoveredFrom?: string
  /** HTTP status of the main navigation; null when the fetch failed. */
  httpStatus: number | null
  /** Document title. */
  pageTitle: string | null
  /** Final URL after redirects. */
  finalUrl: string | null
  /** Raw `Last-Modified` header; the preferred source for sitemap lastmod. */
  lastModified: string | null
  /** True when the fetch ended on a different URL (a redirect was followed). */
  redirected: boolean
  /** Number of links found on this page. */
  foundLinks: number
  /** Failure reason. */
  error?: string
  queuedAt: number
  startedAt: number | null
  finishedAt: number | null
  durationMs: number | null
}

/** One log line: a translation key plus its interpolation parameters. */
export interface LogEntry {
  id: number
  ts: number
  level: LogLevel
  /** i18n key; the UI/export translates it for the active locale. */
  key: LogMessageKey
  /** Values for the `{placeholders}` in the key's template. */
  params?: MessageParams
  url?: string
}

/** sitemaps.org's allowed changefreq values. */
export type Changefreq = 'always' | 'hourly' | 'daily' | 'weekly' | 'monthly' | 'yearly' | 'never'

/** The changefreq setting: 'auto' derives it from link depth. */
export type ChangefreqSetting = Changefreq | 'auto'

/** How `<priority>` is derived. */
export type PriorityStrategy = 'linkDepth' | 'pathDepth' | 'relativePathDepth'

/** Options the user can tune from the UI. */
export interface CrawlOptions {
  /** true = drop the whole query string; false = keep it minus tracking params. */
  stripQuery: boolean
  /** Hard cap on crawled pages (retries do not consume it). */
  maxPages: number
  /** Delay between two request starts, in ms. */
  delayMs: number
  /** Simultaneous in-flight requests (1 = strictly sequential). */
  concurrency: number
  /** Extra attempts for a failed page before it is marked failed (0–5). */
  retryCount: number
  /** Emit <lastmod> in sitemap.xml. */
  includeLastmod: boolean
  /** Emit <priority> in sitemap.xml. */
  includePriority: boolean
  /** Which depth ladder feeds <priority>. */
  priorityStrategy: PriorityStrategy
  /** Emit <changefreq> in sitemap.xml. */
  includeChangefreq: boolean
  /** The <changefreq> value mode. */
  changefreq: ChangefreqSetting
  /** Keep failed pages out of the export. */
  excludeFailed: boolean
  /** Keep pages that ended on a different URL (redirected) out of the export. */
  excludeRedirected: boolean
  /** Split into several sitemap files when over the per-file limit. */
  splitSitemaps: boolean
  /** URLs per generated sitemap file. */
  maxUrlsPerFile: number
  /** Decode non-ASCII path/query characters in exported URLs. */
  readableUrls: boolean
  /** Write the post-redirect address instead of the requested one. */
  useFinalUrl: boolean
  /** Replace the host of every exported URL; empty string disables it. */
  exportHostOverride: string
}

/** Task metadata: the start URL plus its derived scope. */
export interface CrawlTaskMeta {
  startUrl: string
  origin: string
  pathPrefix: string
}

/** Raw counters maintained by the engine; the UI derives everything else. */
export interface CrawlRuntimeStats {
  startedAt: number | null
  finishedAt: number | null
  /** Requests issued so far. */
  requests: number
  /** Current consecutive-failure streak. */
  consecutiveErrors: number
  /** Links skipped because they are not HTML documents. */
  skippedLinks: number
}

/** One throughput sample for the trend chart. */
export interface HistoryPoint {
  t: number
  done: number
  failed: number
  pending: number
}

/**
 * API contract types, inferred from the zod schemas in `lib/crawler/schema.ts` —
 * the single source of truth for the `/api/crawl` wire format.
 *
 * API 契約型別，由 `lib/crawler/schema.ts` 的 zod schema 推導——
 * `/api/crawl` 傳輸格式的唯一真相來源。
 */
export type { CrawlRequest, CrawlResponsePayload } from '@/lib/crawler/schema'

/** Snapshot written to localStorage so a refresh can resume the task. */
export interface PersistedSnapshot {
  version: 1
  savedAt: number
  task: CrawlTaskMeta
  options: CrawlOptions
  queue: string[]
  records: UrlRecord[]
  logs: LogEntry[]
  logSeq: number
  stats: CrawlRuntimeStats
  history: HistoryPoint[]
}