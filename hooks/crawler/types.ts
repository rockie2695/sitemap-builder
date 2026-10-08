/**
 * Internal reducer state and action union for the crawl engine.
 *
 * Kept in its own module so `reducer.ts` stays readable and so tests can drive the
 * state machine directly without rendering React.
 *
 * 抓取狀態機的內部狀態與 action 型別。獨立成檔讓 `reducer.ts` 保持易讀，
 * 也讓測試可以直接驅動狀態機而不用渲染 React。
 */
import type { LogMessageKey, MessageParams } from '@/lib/i18n/types'
import type {
  CrawlOptions,
  CrawlResponsePayload,
  CrawlRuntimeStats,
  CrawlTaskMeta,
  HistoryPoint,
  LogEntry,
  Phase,
  UrlRecord,
} from '@/types/crawl'

/** A log entry before it gets an id and a timestamp. */
export interface LogDraft {
  level: LogEntry['level']
  /** i18n key; the UI translates it for the active locale. */
  key: LogMessageKey
  /** Values for the `{placeholders}` in the key's template. */
  params?: MessageParams
  url?: string
}

/** Structured reason attached to a stop action. */
export interface StopReason {
  key: LogMessageKey
  params?: MessageParams
}

/** Everything the UI renders. Ticks once per second while running. */
export interface CrawlState {
  /** Overall task phase, rendered as the status badge. */
  phase: Phase
  /** Start URL plus the derived origin / path scope. */
  task: CrawlTaskMeta | null
  /** User-tunable options (see `constants.ts`). */
  options: CrawlOptions
  /** URL archive keyed by normalized URL — single source of truth for dedup. */
  records: Map<string, UrlRecord>
  /** Discovery order, so the table never reorders between renders. */
  order: string[]
  /** Timestamped log entries (capped, newest last). */
  logs: LogEntry[]
  /** Monotonic id source for log entries. */
  logSeq: number
  /** Raw counters; the UI derives everything else via `lib/stats.ts`. */
  stats: CrawlRuntimeStats
  /** Throughput samples for the trend chart. */
  history: HistoryPoint[]
  /** Mirrors the engine queue length for display (the queue itself is a ref). */
  pendingCount: number
  /** URL currently being fetched, shown in the "current job" card. */
  currentUrl: string | null
  /** When the in-flight request started, for the live elapsed timer. */
  currentStartedAt: number | null
  /** Set when state came from a persisted snapshot instead of a fresh start. */
  restoredAt: number | null
  /** Ticking clock used for elapsed-time displays. */
  now: number
}

/** Every transition the engine can trigger. */
export type CrawlAction =
  /** Start a brand-new task; discards all previous state. */
  | { type: 'task/start'; task: CrawlTaskMeta; options: CrawlOptions; now: number }
  /** Rehydrate from a localStorage snapshot; always lands in the paused phase. */
  | {
      type: 'task/restore'
      task: CrawlTaskMeta
      options: CrawlOptions
      queue: string[]
      records: UrlRecord[]
      logs: LogEntry[]
      logSeq: number
      stats: CrawlRuntimeStats
      history: HistoryPoint[]
      now: number
    }
  /** Leave the paused phase and continue crawling. */
  | { type: 'task/resume'; now: number }
  /** Enter the paused phase (manual or triggered by repeated failures). */
  | { type: 'task/pause'; now: number }
  /** Abort the task; the queue is dropped by the engine. */
  | { type: 'task/stop'; reason?: StopReason; now: number }
  /** Queue drained: the crawl finished successfully. */
  | { type: 'task/finish'; now: number }
  /** Wipe everything back to a blank slate. */
  | { type: 'task/reset'; now: number }
  /** Merge user-tunable option changes. */
  | { type: 'options/set'; options: Partial<CrawlOptions> }
  /** A URL left the queue and its request is about to be issued. */
  | { type: 'page/start'; url: string; pendingCount: number; now: number }
  /** A failed page is being retried: back to `queued` with one more attempt spent. */
  | {
      type: 'page/requeue'
      url: string
      attempt: number
      max: number
      pendingCount: number
      now: number
    }
  /** A request finished (successfully or not). */
  | {
      type: 'page/result'
      url: string
      ok: boolean
      message?: string
      response?: CrawlResponsePayload
      /** Brand-new URLs found on this page (already deduped and queued by the engine). */
      discovered: string[]
      pendingCount: number
      now: number
    }
  /** Periodic sample: refreshes the clock and appends a chart point. */
  | { type: 'tick'; now: number }
  /** Drop all log entries (the export keeps whatever was captured). */
  | { type: 'logs/clear' }