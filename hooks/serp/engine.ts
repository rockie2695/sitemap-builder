/**
 * The client-side SERP queue loop.
 *
 * One query at a time, with a **minimum interval** between them, so a run cannot
 * hammer a search engine. Kept free of React (deps are injected) so the pacing,
 * fatal-vs-per-query error handling and record shaping are unit-testable.
 *
 * 前端 SERP 佇列迴圈。一次只查一個關鍵詞，且兩次之間有**最小間隔**，
 * 避免連續猛打搜尋引擎。與 React 解耦（協作物件由外部注入），
 * 讓節奏控制、致命／單次錯誤處理與記錄整形都能單獨測試。
 */
import { type SerpErrorCode, type SerpOptions, type SerpQuery, type SerpRecord, type SerpResponse } from '@/types/serp'

import { SERP_PAUSE_POLL_MS } from './constants'

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms)
  })
}

/** Collaborators for {@link runSerpQueue}. */
export interface SerpEngineDeps {
  /** Queries to run, in order. */
  queries: readonly SerpQuery[]
  /** Run options (engine / provider / analysis / interval). */
  options: SerpOptions
  /** Performs one lookup; defaults to the real `/api/serp` call. */
  fetchOne: (entry: SerpQuery, signal: AbortSignal) => Promise<SerpResponse>
  /** Called once with the total number of queries. */
  onStart: (total: number) => void
  /** Called before each lookup. */
  onCurrent: (entry: SerpQuery) => void
  /** Called with a successfully stored record. */
  onResult: (entry: SerpQuery, record: SerpRecord) => void
  /** A recoverable, per-query failure (empty / network); the run continues. */
  onError?: (entry: SerpQuery, code: SerpErrorCode, message: string) => void
  /** A fatal failure (blocked / missing key); the run stops. */
  onFatal: (entry: SerpQuery, code: SerpErrorCode, message: string) => void
  /** Called when every query finished without a fatal error. */
  onDone: () => void
  /** Polled between queries; returning true parks the loop. */
  shouldPause: () => boolean
  /** Abort handle (stop / unmount). */
  signal: AbortSignal
  /** Delay helper, injectable for tests. */
  sleep?: (ms: number) => Promise<void>
  /** Clock, injectable for deterministic tests. */
  now?: () => number
}

/** Error codes that should stop the whole run. */
const FATAL_CODES: ReadonlySet<SerpErrorCode> = new Set(['blocked', 'no_key'])

/**
 * Run the queue to completion, stopping early on a fatal error or abort.
 */
export async function runSerpQueue(deps: SerpEngineDeps): Promise<void> {
  const sleep = deps.sleep ?? defaultSleep
  const now = deps.now ?? Date.now
  const { options, signal } = deps

  deps.onStart(deps.queries.length)

  let lastAt = 0
  let hasRun = false

  for (const entry of deps.queries) {
    if (signal.aborted) return

    while (deps.shouldPause()) {
      if (signal.aborted) return
      await sleep(SERP_PAUSE_POLL_MS)
    }
    if (signal.aborted) return

    // Minimum interval between queries (the first one runs immediately).
    if (hasRun) {
      const wait = options.minIntervalMs - (now() - lastAt)
      if (wait > 0) {
        await sleep(wait)
        if (signal.aborted) return
      }
    }
    lastAt = now()
    hasRun = true

    deps.onCurrent(entry)

    let response: SerpResponse
    try {
      response = await deps.fetchOne(entry, signal)
    } catch (error) {
      if (signal.aborted) return
      deps.onError?.(entry, 'network', error instanceof Error ? error.message : String(error))
      continue
    }
    if (signal.aborted) return

    if (response.errorCode) {
      if (FATAL_CODES.has(response.errorCode)) {
        deps.onFatal(entry, response.errorCode, response.error ?? response.errorCode)
        return
      }
      deps.onError?.(entry, response.errorCode, response.error ?? response.errorCode)
      continue
    }

    deps.onResult(entry, {
      query: response.query,
      engine: response.engine,
      provider: response.provider,
      checkedAt: now(),
      rank: response.rank,
      results: response.results,
      competitors: response.competitors,
    })
  }

  if (!signal.aborted) deps.onDone()
}