/**
 * `useCrawler` — the single entry point the dashboard talks to.
 *
 * It composes four concerns that used to live in one 800-line file:
 *   - `reducer.ts`      pure state machine
 *   - `engine.ts`       queue + crawl loop (owns the mutable FIFO)
 *   - `usePersistence.ts` resume-after-refresh
 *   - this file         wiring, derived stats and the public API
 *
 * `useCrawler` — 儀表板唯一對外介面。原本 800 行的檔案拆成四個關注點：
 *   - `reducer.ts`       純狀態機
 *   - `engine.ts`        佇列與抓取迴圈（擁有可變的 FIFO）
 *   - `usePersistence.ts` 斷點續爬
 *   - 本檔              接線、衍生統計與對外 API
 */
'use client'

import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react'

import { clearSnapshot } from '@/lib/persistence'
import { computeStats, type DerivedStats } from '@/lib/stats'
import { parseStartUrl } from '@/lib/url-utils'
import type {
  CrawlOptions,
  HistoryPoint,
  LogEntry,
  Phase,
  UrlRecord,
  CrawlTaskMeta,
} from '@/types/crawl'

import { SAMPLE_INTERVAL_MS } from './constants'
import { clearQueue, createCrawlEngine, type CrawlEngineRefs } from './engine'
import { crawlReducer, initialCrawlState } from './reducer'
import type { StopReason } from './types'
import { useCrawlerPersistence } from './usePersistence'

export { DEFAULT_OPTIONS } from './constants'
export type { CrawlEngineRefs } from './engine'
export type { CrawlAction, CrawlState } from './types'

/** Result of a `start()` call; the UI turns `error` into an inline alert. */
export interface StartResult {
  ok: boolean
  error?: string
}

/** Everything the dashboard renders and controls. */
export interface UseCrawlerResult {
  phase: Phase
  task: CrawlTaskMeta | null
  options: CrawlOptions
  logs: LogEntry[]
  history: HistoryPoint[]
  /** Derived counters/throughput; recomputed from state on every render. */
  stats: DerivedStats
  /** Archive flattened into discovery order (drives the table and exports). */
  records: UrlRecord[]
  currentUrl: string | null
  currentStartedAt: number | null
  /** Ticking clock (0 until the first tick). */
  now: number
  /** Non-null when the current state came from a snapshot. */
  restoredAt: number | null
  /** Set when localStorage persistence failed. */
  persistError: string | null
  start: (input: string) => StartResult
  pause: () => void
  resume: () => void
  stop: (reason?: StopReason) => void
  reset: () => void
  clearLogs: () => void
  setOptions: (patch: Partial<CrawlOptions>) => void
}

/**
 * Drive a crawl task.
 *
 * @example
 * const crawler = useCrawler()
 * crawler.start('https://example.com/docs/')
 */
export function useCrawler(): UseCrawlerResult {
  const [state, dispatch] = useReducer(crawlReducer, initialCrawlState)
  const [persistError, setPersistError] = useState<string | null>(null)

  // Refs are the bridge between React's render cycle and the async crawl loop.
  const stateRef = useRef(state)
  const optionsRef = useRef(state.options)
  const controlRef = useRef({ paused: false })
  const queueRef = useRef<string[]>([])
  const seenRef = useRef<Set<string>>(new Set())
  const attemptsRef = useRef<Map<string, number>>(new Map())
  const abortRef = useRef<AbortController>(new AbortController())
  const runningRef = useRef(false)

  // Stable wiring object: every cell is itself a stable ref, so the engine and
  // the callbacks below stay referentially stable across renders.
  const refs = useMemo<CrawlEngineRefs>(
    () => ({
      state: stateRef,
      options: optionsRef,
      control: controlRef,
      queue: queueRef,
      seen: seenRef,
      attempts: attemptsRef,
      abort: abortRef,
      running: runningRef,
    }),
    [],
  )

  // Refresh the mirrors after each render; the loop reads them between awaits.
  useEffect(() => {
    stateRef.current = state
    optionsRef.current = state.options
  }, [state])

  // The engine is created lazily inside event handlers: passing refs to a function
  // during render is what the react-hooks/refs rule (correctly) warns about.
  const engineRef = useRef<ReturnType<typeof createCrawlEngine> | null>(null)
  const getEngine = useCallback(() => {
    engineRef.current ??= createCrawlEngine(refs, { dispatch })
    return engineRef.current
  }, [refs, dispatch])

  /** Stable passthrough so the persistence effect never touches the engine ref. */
  const restoreQueue = useCallback(
    (queue: string[], startUrl: string, knownUrls: string[]) =>
      getEngine().restoreQueue(queue, startUrl, knownUrls),
    [getEngine],
  )

  useCrawlerPersistence({
    state,
    dispatch,
    refs,
    restoreQueue,
    setPersistError,
  })

  // ---- Sampling: refresh elapsed time + chart points while running ----
  useEffect(() => {
    if (state.phase !== 'running') return
    const timer = setInterval(() => dispatch({ type: 'tick', now: Date.now() }), SAMPLE_INTERVAL_MS)
    return () => clearInterval(timer)
  }, [state.phase])

  // ---- Abort any in-flight request on unmount ----
  useEffect(() => () => abortRef.current.abort(), [])

  /** Validate the input, reset engine state and kick off the loop. */
  const start = useCallback(
    (input: string): StartResult => {
      const parsed = parseStartUrl(input)
      if (!parsed) {
        return { ok: false, error: '请输入合法的 URL，且必须以 http:// 或 https:// 开头' }
      }

      abortRef.current.abort()
      abortRef.current = new AbortController()
      controlRef.current.paused = false

      getEngine().seedQueue(parsed.startUrl)
      clearSnapshot()

      dispatch({
        type: 'task/start',
        task: { startUrl: parsed.startUrl, origin: parsed.origin, pathPrefix: parsed.pathPrefix },
        options: optionsRef.current,
        now: Date.now(),
      })

      void getEngine().run()
      return { ok: true }
    },
    [getEngine],
  )

  /** Park the loop between two pages; the in-flight request is allowed to finish. */
  const pause = useCallback(() => {
    controlRef.current.paused = true
    dispatch({ type: 'task/pause', now: Date.now() })
  }, [])

  /** Leave the paused phase and (re)start the loop if it had already exited. */
  const resume = useCallback(() => {
    controlRef.current.paused = false
    abortRef.current = new AbortController()
    dispatch({ type: 'task/resume', now: Date.now() })
    void getEngine().run()
  }, [getEngine])

  /** Cancel immediately: abort the in-flight request and drop the queue. */
  const stop = useCallback((reason?: StopReason) => {
    controlRef.current.paused = false
    clearQueue(refs)
    abortRef.current.abort()
    abortRef.current = new AbortController()
    dispatch({ type: 'task/stop', reason, now: Date.now() })
  }, [refs])

  /** Wipe the task, the archive and the stored snapshot. */
  const reset = useCallback(() => {
    controlRef.current.paused = false
    clearQueue(refs)
    abortRef.current.abort()
    abortRef.current = new AbortController()
    clearSnapshot()
    setPersistError(null)
    dispatch({ type: 'task/reset', now: Date.now() })
  }, [refs])

  const clearLogs = useCallback(() => dispatch({ type: 'logs/clear' }), [])

  const setOptions = useCallback(
    (patch: Partial<CrawlOptions>) => dispatch({ type: 'options/set', options: patch }),
    [],
  )

  const stats = useMemo(
    () => computeStats(state.records, state.stats, state.now, state.pendingCount, state.history),
    [state.records, state.stats, state.now, state.pendingCount, state.history],
  )

  const records = useMemo(
    () =>
      state.order
        .map((url) => state.records.get(url))
        .filter((record): record is UrlRecord => Boolean(record)),
    [state.order, state.records],
  )

  return {
    phase: state.phase,
    task: state.task,
    options: state.options,
    logs: state.logs,
    history: state.history,
    stats,
    records,
    currentUrl: state.currentUrl,
    currentStartedAt: state.currentStartedAt,
    now: state.now,
    restoredAt: state.restoredAt,
    persistError,
    start,
    pause,
    resume,
    stop,
    reset,
    clearLogs,
    setOptions,
  }
}
