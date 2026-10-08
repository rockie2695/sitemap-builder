/**
 * The crawl state machine.
 *
 * `crawlReducer` is a pure function: it never touches refs, timers or the network,
 * which is what makes it directly unit-testable (see `tests/unit/crawl-reducer.test.ts`).
 *
 * 抓取狀態機。`crawlReducer` 是純函式：不碰 ref、不碰計時器、不碰網路，
 * 因此可以直接單元測試（見 `tests/unit/crawl-reducer.test.ts`）。
 */
import type { CrawlRuntimeStats, LogEntry, UrlRecord } from '@/types/crawl'

import { DEFAULT_OPTIONS, HISTORY_LIMIT, LOG_LIMIT, MAX_CONSECUTIVE_ERRORS } from './constants'
import type { CrawlAction, CrawlState, LogDraft } from './types'

/** Zeroed runtime counters, reused for every fresh task. */
export const EMPTY_STATS: CrawlRuntimeStats = {
  startedAt: null,
  finishedAt: null,
  requests: 0,
  consecutiveErrors: 0,
  skippedLinks: 0,
}

/** Blank state before any task starts. */
export const initialCrawlState: CrawlState = {
  phase: 'idle',
  task: null,
  options: DEFAULT_OPTIONS,
  records: new Map(),
  order: [],
  logs: [],
  logSeq: 0,
  stats: EMPTY_STATS,
  history: [],
  pendingCount: 0,
  currentUrl: null,
  currentStartedAt: null,
  restoredAt: null,
  now: 0,
}

/**
 * Create a queueable record for a freshly discovered URL.
 *
 * @param url            Normalized absolute URL.
 * @param depth          Link distance from the start page (start page = 0).
 * @param discoveredFrom Parent URL, or `undefined` for the start page.
 * @param now            Timestamp used for `queuedAt`.
 */
export function makeRecord(
  url: string,
  depth: number,
  discoveredFrom: string | undefined,
  now: number,
): UrlRecord {
  return {
    url,
    status: 'queued',
    depth,
    discoveredFrom,
    httpStatus: null,
    pageTitle: null,
    finalUrl: null,
    lastModified: null,
    foundLinks: 0,
    queuedAt: now,
    startedAt: null,
    finishedAt: null,
    durationMs: null,
  }
}

/** Trim a string for single-line log messages. */
function truncate(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max)}…` : text
}

/**
 * Count finished/failed records without allocating intermediate arrays.
 * Called once per second by the sampler, so it must stay cheap.
 */
function countByStatus(records: ReadonlyMap<string, UrlRecord>): { done: number; failed: number } {
  let done = 0
  let failed = 0
  for (const record of records.values()) {
    if (record.status === 'done') done += 1
    else if (record.status === 'failed') failed += 1
  }
  return { done, failed }
}

/**
 * Finalise records still marked `crawling` when a task ends.
 *
 * Without this, stopping the crawl (or draining the queue) would leave a record
 * stuck in the "抓取中 / crawling" state forever.
 *
 * @param records Current archive.
 * @param now     Timestamp for `finishedAt`.
 * @param reason  Error message stored on the affected records.
 * @returns A new map when something changed, otherwise the original map.
 */
export function settleCrawling(
  records: Map<string, UrlRecord>,
  now: number,
  reason: string,
): Map<string, UrlRecord> {
  let hasCrawling = false
  for (const record of records.values()) {
    if (record.status === 'crawling') {
      hasCrawling = true
      break
    }
  }
  if (!hasCrawling) return records

  const next = new Map(records)
  for (const [url, record] of next) {
    if (record.status !== 'crawling') continue
    next.set(url, { ...record, status: 'failed', error: reason, finishedAt: now })
  }
  return next
}

/**
 * Append log drafts, assigning ids and enforcing the ring-buffer cap.
 *
 * @returns The next log array plus the advanced id counter.
 */
function withLogs(
  logs: LogEntry[],
  logSeq: number,
  ts: number,
  drafts: LogDraft[],
): { logs: LogEntry[]; logSeq: number } {
  if (drafts.length === 0) return { logs, logSeq }

  let seq = logSeq
  const appended: LogEntry[] = drafts.map((draft) => ({
    id: (seq += 1),
    ts,
    level: draft.level,
    message: draft.message,
    url: draft.url,
  }))

  const merged = [...logs, ...appended]
  return {
    logs: merged.length > LOG_LIMIT ? merged.slice(merged.length - LOG_LIMIT) : merged,
    logSeq: seq,
  }
}

/**
 * Reducer for the whole crawl UI state.
 *
 * Key behaviours worth knowing before editing:
 * - `page/result` decides `done` vs `failed` from the *page* HTTP status, not just
 *   transport success: a reachable 404 must never end up in the sitemap.
 * - Newly discovered URLs arrive pre-deduped from the engine (`action.discovered`),
 *   because the queue lives in the engine, not in the reducer.
 * - `page/result` counts only transport failures toward the auto-pause threshold.
 */
export function crawlReducer(state: CrawlState, action: CrawlAction): CrawlState {
  switch (action.type) {
    case 'task/start': {
      const record = makeRecord(action.task.startUrl, 0, undefined, action.now)

      const { logs, logSeq } = withLogs(state.logs, state.logSeq, action.now, [
        { level: 'info', message: `任务开始：${action.task.startUrl}` },
        {
          level: 'info',
          message: `作用域：origin=${action.task.origin}，路径前缀=${
            action.task.pathPrefix || '（全部路径）'
          }，查询参数=${action.options.stripQuery ? '已移除' : '保留'}，页数上限=${
            action.options.maxPages
          }，请求间隔=${action.options.delayMs}ms`,
        },
      ])

      return {
        ...initialCrawlState,
        options: action.options,
        now: action.now,
        task: action.task,
        phase: 'running',
        stats: { ...EMPTY_STATS, startedAt: action.now },
        records: new Map([[record.url, record]]),
        order: [record.url],
        pendingCount: 1,
        logs,
        logSeq,
      }
    }

    case 'task/restore': {
      return {
        ...state,
        task: action.task,
        options: action.options,
        records: new Map(action.records.map((record) => [record.url, record])),
        order: action.records.map((record) => record.url),
        logs: action.logs,
        logSeq: action.logSeq,
        stats: action.stats,
        history: action.history,
        pendingCount: action.queue.length,
        // A restored task always starts paused; the user decides whether to resume.
        phase: 'paused',
        currentUrl: null,
        currentStartedAt: null,
        restoredAt: action.now,
        now: action.now,
      }
    }

    case 'task/resume':
      return { ...state, phase: 'running', restoredAt: null, now: action.now }

    case 'task/pause':
      return { ...state, phase: 'paused', now: action.now }

    case 'task/stop': {
      const { logs, logSeq } = withLogs(state.logs, state.logSeq, action.now, [
        {
          level: 'warn',
          message: action.reason ? `任务停止：${action.reason}` : '任务已手动停止',
        },
      ])

      return {
        ...state,
        records: settleCrawling(state.records, action.now, '任务已停止，该页面未完成抓取'),
        phase: 'stopped',
        pendingCount: 0,
        currentUrl: null,
        currentStartedAt: null,
        stats: { ...state.stats, finishedAt: action.now },
        logs,
        logSeq,
        now: action.now,
      }
    }

    case 'task/finish': {
      if (state.phase !== 'running') return state
      const { done } = countByStatus(state.records)
      const { logs, logSeq } = withLogs(state.logs, state.logSeq, action.now, [
        {
          level: 'success',
          message: `队列已清空，抓取结束：共发现 ${state.records.size} 个页面，成功 ${done} 个`,
        },
      ])
      return {
        ...state,
        records: settleCrawling(state.records, action.now, '任务结束，该页面未完成抓取'),
        phase: 'done',
        pendingCount: 0,
        currentUrl: null,
        currentStartedAt: null,
        stats: { ...state.stats, finishedAt: action.now },
        logs,
        logSeq,
        now: action.now,
      }
    }

    case 'task/reset':
      return { ...initialCrawlState, options: state.options, now: action.now }

    case 'options/set':
      return { ...state, options: { ...state.options, ...action.options } }

    case 'page/start': {
      const previous = state.records.get(action.url)
      if (!previous) return { ...state, pendingCount: action.pendingCount }

      const records = new Map(state.records)
      records.set(action.url, { ...previous, status: 'crawling', startedAt: action.now })

      const { logs, logSeq } = withLogs(state.logs, state.logSeq, action.now, [
        { level: 'info', message: `▶ 抓取中 ${action.url}`, url: action.url },
      ])

      return {
        ...state,
        records,
        logs,
        logSeq,
        pendingCount: action.pendingCount,
        currentUrl: action.url,
        currentStartedAt: action.now,
        now: action.now,
      }
    }

    case 'page/result': {
      const previous = state.records.get(action.url)
      if (!previous) return { ...state, pendingCount: action.pendingCount }

      const records = new Map(state.records)
      const order = [...state.order]
      const drafts: LogDraft[] = []
      const response = action.response

      if (action.ok && response) {
        // A reachable 4xx/5xx page is NOT "done": shipping it in a sitemap
        // would hand search engines broken URLs.
        const statusFailed = response.httpStatus === null || response.httpStatus >= 400

        records.set(action.url, {
          ...previous,
          status: statusFailed ? 'failed' : 'done',
          httpStatus: response.httpStatus,
          pageTitle: response.pageTitle,
          finalUrl: response.finalUrl,
          lastModified: response.lastModified ?? null,
          foundLinks: response.links.length,
          durationMs: response.durationMs,
          finishedAt: action.now,
          ...(statusFailed
            ? {
                error:
                  response.httpStatus === null
                    ? '页面未返回状态码'
                    : `HTTP ${response.httpStatus}`,
              }
            : {}),
        })

        // Links are collected regardless of the page's own status code.
        for (const link of action.discovered) {
          if (records.has(link)) continue
          records.set(link, makeRecord(link, previous.depth + 1, action.url, action.now))
          order.push(link)
        }

        const http = response.httpStatus === null ? 'HTTP ?' : `HTTP ${response.httpStatus}`
        const title = response.pageTitle ? ` · ${truncate(response.pageTitle, 40)}` : ''

        if (statusFailed) {
          drafts.push({
            level: 'error',
            message: `✗ ${http}${title} · 该地址不可用，已排除出 sitemap`,
            url: action.url,
          })
        } else {
          drafts.push({
            level: response.error ? 'warn' : 'success',
            message: `✓ ${http}${title} · 发现 ${response.links.length} 个链接 · ${(
              response.durationMs / 1000
            ).toFixed(1)}s${response.error ? ` · 页面异常：${response.error}` : ''}`,
            url: action.url,
          })
        }
      } else {
        const message = action.message ?? '未知错误'
        records.set(action.url, {
          ...previous,
          status: 'failed',
          error: message,
          finishedAt: action.now,
          durationMs: previous.startedAt === null ? null : action.now - previous.startedAt,
        })
        drafts.push({ level: 'error', message: `✗ 抓取失败：${message}`, url: action.url })
      }

      const consecutiveErrors = action.ok ? 0 : state.stats.consecutiveErrors + 1
      const autoPause = consecutiveErrors >= MAX_CONSECUTIVE_ERRORS
      if (autoPause) {
        drafts.push({
          level: 'error',
          message: `连续 ${consecutiveErrors} 次失败，已自动暂停。请确认目标站点可访问后点击「继续」。`,
        })
      }

      const { logs, logSeq } = withLogs(state.logs, state.logSeq, action.now, drafts)

      return {
        ...state,
        records,
        order,
        logs,
        logSeq,
        phase: autoPause ? 'paused' : state.phase,
        pendingCount: action.pendingCount,
        currentUrl: null,
        currentStartedAt: null,
        stats: {
          ...state.stats,
          requests: state.stats.requests + 1,
          consecutiveErrors,
          skippedLinks: state.stats.skippedLinks + (response?.skippedLinks ?? 0),
        },
        now: action.now,
      }
    }

    case 'tick': {
      const { done, failed } = countByStatus(state.records)
      const history = [...state.history, { t: action.now, done, failed, pending: state.pendingCount }]
      return {
        ...state,
        now: action.now,
        history:
          history.length > HISTORY_LIMIT
            ? history.slice(history.length - HISTORY_LIMIT)
            : history,
      }
    }

    case 'logs/clear':
      return { ...state, logs: [] }

    default:
      return state
  }
}