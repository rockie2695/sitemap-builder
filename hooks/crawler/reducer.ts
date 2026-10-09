/**
 * The crawl state machine.
 *
 * `crawlReducer` is a pure function: it never touches refs, timers or the network,
 * which is what makes it directly unit-testable (see `tests/unit/crawl-reducer.test.ts`).
 * It also never formats user-facing text — log lines are emitted as i18n keys plus
 * parameters so the UI can render them in any locale.
 *
 * 抓取狀態機。`crawlReducer` 是純函式：不碰 ref、不碰計時器、不碰網路，因此可直接單元測試
 * （見 `tests/unit/crawl-reducer.test.ts`）。它也不格式化任何面向使用者的文字——
 * 日誌以 i18n 鍵加參數輸出，讓介面能以任意語系呈現。
 */
import type { LogEntry, UrlRecord } from '@/types/crawl'

import { isRedirected } from '@/lib/crawler/redirect'

import { DEFAULT_OPTIONS, HISTORY_LIMIT, LOG_LIMIT, MAX_CONSECUTIVE_ERRORS } from './constants'
import type { CrawlAction, CrawlState, LogDraft } from './types'
import type { CrawlRuntimeStats } from '@/types/crawl'

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
    redirected: false,
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

/** Count finished/failed records without allocating intermediate arrays. */
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
 * stuck in the "crawling" state forever.
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
    key: draft.key,
    params: draft.params,
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
 * - Logs carry i18n keys, never formatted prose.
 */
export function crawlReducer(state: CrawlState, action: CrawlAction): CrawlState {
  switch (action.type) {
    case 'task/start': {
      const record = makeRecord(action.task.startUrl, 0, undefined, action.now)
      const { options } = action

      const scopeParams = {
        origin: action.task.origin,
        prefix: action.task.pathPrefix || '/',
        maxPages: options.maxPages,
        delay: options.delayMs,
        concurrency: options.concurrency,
        retries: options.retryCount,
      }

      const { logs, logSeq } = withLogs(state.logs, state.logSeq, action.now, [
        { level: 'info', key: 'log.task.start', params: { url: action.task.startUrl } },
        {
          level: 'info',
          key: options.stripQuery ? 'log.task.scope.stripped' : 'log.task.scope.kept',
          params: scopeParams,
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
      const draft: LogDraft = action.reason
        ? { level: 'warn', key: action.reason.key, params: action.reason.params }
        : { level: 'warn', key: 'log.task.stopped' }

      const { logs, logSeq } = withLogs(state.logs, state.logSeq, action.now, [draft])

      return {
        ...state,
        records: settleCrawling(state.records, action.now, 'Task stopped before this page finished'),
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
          key: 'log.task.finish',
          params: { total: state.records.size, done },
        },
      ])
      return {
        ...state,
        records: settleCrawling(state.records, action.now, 'Task finished before this page completed'),
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
        { level: 'info', key: 'log.page.start', params: { url: action.url }, url: action.url },
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

    case 'page/requeue': {
      const previous = state.records.get(action.url)
      if (!previous) return { ...state, pendingCount: action.pendingCount }

      const records = new Map(state.records)
      records.set(action.url, {
        ...previous,
        status: 'queued',
        // Clear the previous failure so a later success is not shadowed by it.
        error: undefined,
        startedAt: null,
        finishedAt: null,
        durationMs: null,
      })

      const { logs, logSeq } = withLogs(state.logs, state.logSeq, action.now, [
        {
          level: 'warn',
          key: 'log.page.retry',
          params: { attempt: action.attempt, max: action.max, url: action.url },
          url: action.url,
        },
      ])

      return {
        ...state,
        records,
        logs,
        logSeq,
        pendingCount: action.pendingCount,
        currentUrl: null,
        currentStartedAt: null,
        // A retry is not a new page, so the request counter does not advance here.
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
          redirected: isRedirected(action.url, response.finalUrl, state.options.stripQuery),
          lastModified: response.lastModified ?? null,
          seo: response.seo ?? previous.seo,
          foundLinks: response.links.length,
          durationMs: response.durationMs,
          finishedAt: action.now,
          ...(statusFailed
            ? {
                error:
                  response.httpStatus === null
                    ? 'no HTTP status'
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
        const title = response.pageTitle ? truncate(response.pageTitle, 40) : ''

        if (statusFailed) {
          drafts.push({
            level: 'error',
            key: 'log.page.httpError',
            params: { http, title },
            url: action.url,
          })
        } else {
          drafts.push({
            level: response.error ? 'warn' : 'success',
            key: response.error ? 'log.page.okWarn' : 'log.page.ok',
            params: {
              http,
              title,
              links: response.links.length,
              seconds: (response.durationMs / 1000).toFixed(1),
              error: response.error ?? '',
            },
            url: action.url,
          })
        }
      } else {
        const message = action.message ?? 'unknown error'
        records.set(action.url, {
          ...previous,
          status: 'failed',
          error: message,
          finishedAt: action.now,
          durationMs: previous.startedAt === null ? null : action.now - previous.startedAt,
        })
        drafts.push({
          level: 'error',
          key: 'log.page.fail',
          params: { message },
          url: action.url,
        })
      }

      const consecutiveErrors = action.ok ? 0 : state.stats.consecutiveErrors + 1
      const autoPause = consecutiveErrors >= MAX_CONSECUTIVE_ERRORS
      if (autoPause) {
        drafts.push({
          level: 'error',
          key: 'log.page.autoPaused',
          params: { count: consecutiveErrors },
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

    case 'logs/add': {
      const { logs, logSeq } = withLogs(state.logs, state.logSeq, action.now, action.drafts)
      return { ...state, logs, logSeq, now: action.now }
    }

    case 'logs/clear':
      return { ...state, logs: [] }

    default:
      return state
  }
}