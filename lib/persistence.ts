/**
 * Resume-after-refresh: write the task snapshot to localStorage.
 *
 * localStorage has a ~5MB quota, so records, queue and logs are capped; quota
 * errors degrade to "no persistence" instead of breaking the crawl.
 *
 * 斷點續爬：把任務快照寫入 localStorage。
 * localStorage 有約 5MB 配額，因此記錄、佇列與日誌都有上限；
 * 配額錯誤會降級為「不持久化」，不影響抓取本身。
 */
import type {
  CrawlOptions,
  CrawlRuntimeStats,
  CrawlTaskMeta,
  HistoryPoint,
  LogEntry,
  PersistedSnapshot,
  UrlRecord,
} from '@/types/crawl'

/** localStorage key for the crawl snapshot. */
const STORAGE_KEY = 'sitemap-builder:crawl:v1'

/** Persistence caps, so a huge crawl cannot blow the quota. */
const MAX_RECORDS = 5_000
const MAX_QUEUE = 5_000
const MAX_LOGS = 500
const MAX_HISTORY = 120

/** Input for {@link saveSnapshot}. */
export interface SaveInput {
  task: CrawlTaskMeta
  options: CrawlOptions
  queue: string[]
  records: readonly UrlRecord[]
  logs: readonly LogEntry[]
  logSeq: number
  stats: CrawlRuntimeStats
  history: readonly HistoryPoint[]
}

/** Result of a write. */
export type SaveResult = { ok: true } | { ok: false; reason: string }

/**
 * Write the snapshot.
 *
 * @param input Everything needed to resume the task later.
 */
export function saveSnapshot(input: SaveInput): SaveResult {
  try {
    // Keep the most recent records — the queue references them by URL.
    const records = input.records.slice(-MAX_RECORDS)
    const snapshot: PersistedSnapshot = {
      version: 1,
      savedAt: Date.now(),
      task: input.task,
      options: input.options,
      queue: input.queue.slice(0, MAX_QUEUE),
      records,
      logs: input.logs.slice(-MAX_LOGS),
      logSeq: input.logSeq,
      stats: input.stats,
      history: input.history.slice(-MAX_HISTORY),
    }
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot))
    return { ok: true }
  } catch (error) {
    return { ok: false, reason: error instanceof Error ? error.message : String(error) }
  }
}

/**
 * Read the snapshot; corrupted data or a version mismatch returns null.
 */
export function loadSnapshot(): PersistedSnapshot | null {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as PersistedSnapshot
    if (parsed?.version !== 1 || !Array.isArray(parsed.records)) return null
    return parsed
  } catch {
    return null
  }
}

/** Delete the snapshot (used by the reset button). */
export function clearSnapshot(): void {
  try {
    window.localStorage.removeItem(STORAGE_KEY)
  } catch {
    // Ignored: storage may be unavailable in private mode.
  }
}