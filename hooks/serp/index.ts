/**
 * `useSerp` — the SERP checking workspace.
 *
 * Owns the run loop, the collected records (persisted under their own localStorage key,
 * separate from the crawl snapshot), and the options. The queue is derived from the
 * crawl archive on demand and is resumable: a run only queries pages that have no
 * stored record yet, so a resume after a block continues where it left off.
 *
 * `useSerp` —— SERP 檢查工作區。
 * 負責執行迴圈、收集到的記錄（以自己的 localStorage 鍵保存，與抓取快照分開）與選項。
 * 佇列依需求從抓取結果推導，且可續跑：一次執行只查尚未有記錄的頁面，
 * 因此被封鎖後恢復會從中斷處繼續。
 */
'use client'

import { useCallback, useMemo, useRef, useState } from 'react'

import { useStoredState } from '@/hooks/useStoredState'
import { deriveQueries } from '@/lib/serp/queries'
import { buildSeoReport } from '@/lib/seo/report'
import { contextFromReport, scorePage } from '@/lib/seo/score'
import type { UrlRecord } from '@/types/crawl'
import {
  SERP_MAX_ANALYZE_TOP,
  SERP_MAX_QUERIES,
  SERP_MIN_INTERVAL_MS,
  type SerpErrorCode,
  type SerpOptions,
  type SerpQuery,
  type SerpRecord,
  type SerpStatus,
} from '@/types/serp'

import { DEFAULT_SERP_OPTIONS, SERP_OPTIONS_KEY, SERP_RESULTS_KEY } from './constants'
import { runSerpQueue } from './engine'
import { requestSerp } from './request'

/** Records keyed by the target page URL. */
export type SerpResults = Record<string, SerpRecord>

/** One recoverable failure, surfaced in the UI. */
export interface SerpFailure {
  url: string
  query: string
  code: SerpErrorCode
  message: string
}

/** Everything the SERP UI needs. */
export interface UseSerpResult {
  status: SerpStatus
  /** Collected records, keyed by page URL. */
  results: SerpResults
  /** Derived queue (capped by `options.maxQueries`). */
  queries: SerpQuery[]
  /** How many of the queue's pages already have a record. */
  completed: number
  /** The query currently in flight. */
  current: SerpQuery | null
  /** Recoverable per-query failures from the latest run. */
  failures: SerpFailure[]
  /** Fatal error (blocked / missing key) that stopped the run. */
  fatal: { code: SerpErrorCode; message: string } | null
  options: SerpOptions
  setOptions: (patch: Partial<SerpOptions>) => void
  start: () => void
  pause: () => void
  resume: () => void
  stop: () => void
  clear: () => void
}

/** Clamp options to their allowed ranges. */
function clampOptions(options: SerpOptions): SerpOptions {
  return {
    ...options,
    maxQueries: Math.min(Math.max(1, options.maxQueries), SERP_MAX_QUERIES),
    analyzeTop: Math.min(Math.max(0, options.analyzeTop), SERP_MAX_ANALYZE_TOP),
    minIntervalMs: Math.max(SERP_MIN_INTERVAL_MS, options.minIntervalMs),
  }
}

/**
 * Build the SERP workspace from the crawl archive.
 *
 * @param records The crawl archive (audited pages provide the queries).
 */
export function useSerp(records: readonly UrlRecord[]): UseSerpResult {
  const [storedOptions, setStoredOptions] = useStoredState<SerpOptions>(SERP_OPTIONS_KEY, DEFAULT_SERP_OPTIONS)
  const [results, setResults] = useStoredState<SerpResults>(SERP_RESULTS_KEY, {})
  const [status, setStatus] = useState<SerpStatus>('idle')
  const [current, setCurrent] = useState<SerpQuery | null>(null)
  const [failures, setFailures] = useState<SerpFailure[]>([])
  const [fatal, setFatal] = useState<{ code: SerpErrorCode; message: string } | null>(null)

  const abortRef = useRef<AbortController | null>(null)
  const pausedRef = useRef(false)
  const runningRef = useRef(false)

  // Merge over defaults so a stored value from an older build cannot leave a field
  // undefined (invariant: new options are always backfilled).
  const options = useMemo(() => clampOptions({ ...DEFAULT_SERP_OPTIONS, ...storedOptions }), [storedOptions])

  /** Every page worth querying, worst SEO score first, de-duplicated and capped. */
  const queries = useMemo<SerpQuery[]>(() => {
    const context = contextFromReport(buildSeoReport(records))
    const scores = new Map<string, number | null>()
    for (const record of records) {
      if (record.seo) scores.set(record.url, scorePage(record, context).score)
    }
    return deriveQueries(records, { maxQueries: options.maxQueries, scores })
  }, [records, options.maxQueries])

  const completed = useMemo(
    () => queries.reduce((sum, entry) => sum + (results[entry.url] ? 1 : 0), 0),
    [queries, results],
  )

  const setOptions = useCallback(
    (patch: Partial<SerpOptions>) => {
      setStoredOptions((previous) => ({ ...DEFAULT_SERP_OPTIONS, ...previous, ...patch }))
    },
    [setStoredOptions],
  )

  /** Run every query that has no stored record yet. */
  const run = useCallback(() => {
    if (runningRef.current) return

    const queue = queries.filter((entry) => !results[entry.url])
    if (queue.length === 0) {
      setStatus('done')
      return
    }

    const controller = new AbortController()
    abortRef.current = controller
    pausedRef.current = false
    runningRef.current = true
    setFatal(null)
    setFailures([])
    setStatus('running')

    void runSerpQueue({
      queries: queue,
      options,
      signal: controller.signal,
      shouldPause: () => pausedRef.current,
      fetchOne: (entry, signal) =>
        requestSerp(
          entry,
          {
            engine: options.engine,
            provider: options.provider,
            analyzeTop: options.analyzeTop,
          },
          signal,
        ),
      onStart: () => undefined,
      onCurrent: (entry) => setCurrent(entry),
      onResult: (entry, record) => {
        setResults((previous) => ({ ...previous, [entry.url]: record }))
      },
      onError: (entry, code, message) => {
        setFailures((previous) => [
          ...previous.slice(-49),
          { url: entry.url, query: entry.query, code, message },
        ])
      },
      onFatal: (entry, code, message) => {
        setFailures((previous) => [
          ...previous.slice(-49),
          { url: entry.url, query: entry.query, code, message },
        ])
        setFatal({ code, message })
        setStatus('paused')
      },
      onDone: () => {
        setCurrent(null)
        setStatus('done')
      },
    }).finally(() => {
      runningRef.current = false
    })
  }, [queries, results, options, setResults])

  const start = useCallback(() => run(), [run])

  const pause = useCallback(() => {
    pausedRef.current = true
    setStatus('paused')
  }, [])

  const resume = useCallback(() => {
    setStatus('running')
    pausedRef.current = false
    // A fatal error ends the loop, so resuming restarts it for the remaining pages.
    if (!runningRef.current) run()
  }, [run])

  const stop = useCallback(() => {
    abortRef.current?.abort()
    runningRef.current = false
    setCurrent(null)
    setStatus('stopped')
  }, [])

  const clear = useCallback(() => {
    abortRef.current?.abort()
    runningRef.current = false
    pausedRef.current = false
    setResults({})
    setFailures([])
    setFatal(null)
    setCurrent(null)
    setStatus('idle')
  }, [setResults])

  return {
    status,
    results,
    queries,
    completed,
    current,
    failures,
    fatal,
    options,
    setOptions,
    start,
    pause,
    resume,
    stop,
    clear,
  }
}

export { DEFAULT_SERP_OPTIONS } from './constants'