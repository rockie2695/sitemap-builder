/**
 * `useAnalytics` — GA4 traffic for the crawled pages.
 *
 * Sends the distinct page paths to `POST /api/analytics` (credentials stay on the server)
 * and keeps the result in `localStorage`, so the traffic column and the
 * "high-traffic, low-score" prioritisation survive a reload.
 *
 * `useAnalytics` —— 已抓取頁面的 GA4 流量。把相異頁面路徑送到 `POST /api/analytics`
 * （憑證留在伺服器端），並將結果存入 `localStorage`，讓流量欄與「高流量低分」優先排序
 * 在重新整理後仍保留。
 */
'use client'

import { useCallback, useMemo, useState } from 'react'

import { useStoredState } from '@/hooks/useStoredState'
import { analyticsResponseSchema } from '@/lib/analytics/schema'
import type { UrlRecord } from '@/types/crawl'

/** Traffic numbers for one path. */
export interface TrafficEntry {
  pageViews: number
  sessions: number
}

/** Traffic keyed by page path. */
export type TrafficByPath = Record<string, TrafficEntry>

/** Load lifecycle. */
export type AnalyticsStatus = 'idle' | 'loading' | 'done' | 'error'

/** localStorage key for the cached traffic. */
export const GA4_STORAGE_KEY = 'ga4-traffic:v1'

/** Endpoint that fetches GA4 numbers server-side. */
export const ANALYTICS_ENDPOINT = '/api/analytics'

/**
 * The pathname of a URL, query/hash stripped.
 *
 * @param value Absolute URL or a bare path.
 */
export function pathnameOf(value: string): string {
  try {
    return new URL(value).pathname || '/'
  } catch {
    const trimmed = value.trim().split(/[?#]/)[0]
    if (!trimmed) return '/'
    return trimmed.startsWith('/') ? trimmed : `/${trimmed}`
  }
}

/** Everything the traffic UI needs. */
export interface UseAnalyticsResult {
  status: AnalyticsStatus
  traffic: TrafficByPath
  error: { code?: string; message: string } | null
  /** Distinct paths that would be queried. */
  paths: string[]
  /** Fetch the numbers for the current archive. */
  load: () => void
  /** Forget the cached numbers. */
  clear: () => void
}

/**
 * Build the traffic workspace from the crawl archive.
 *
 * @param records The crawl archive.
 */
export function useAnalytics(records: readonly UrlRecord[]): UseAnalyticsResult {
  const [traffic, setTraffic] = useStoredState<TrafficByPath>(GA4_STORAGE_KEY, {})
  const [status, setStatus] = useState<AnalyticsStatus>('idle')
  const [error, setError] = useState<{ code?: string; message: string } | null>(null)

  /** Distinct paths of successfully crawled pages. */
  const paths = useMemo(() => {
    const unique = new Set<string>()
    for (const record of records) {
      if (record.status === 'done') unique.add(pathnameOf(record.url))
    }
    return [...unique]
  }, [records])

  const load = useCallback(() => {
    void (async () => {
      if (paths.length === 0) {
        setStatus('done')
        return
      }
      setStatus('loading')
      setError(null)
      try {
        const response = await fetch(ANALYTICS_ENDPOINT, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ paths }),
        })
        const parsed = analyticsResponseSchema.safeParse(await response.json().catch(() => undefined))
        if (!parsed.success) {
          setError({ message: `服务端返回了无法解析的响应（HTTP ${response.status}）` })
          setStatus('error')
          return
        }
        if (parsed.data.errorCode) {
          setError({ code: parsed.data.errorCode, message: parsed.data.error ?? '' })
          setStatus('error')
          return
        }
        // Fold several pagePath values that share a pathname (query variants).
        const map: TrafficByPath = {}
        for (const row of parsed.data.rows) {
          const key = pathnameOf(row.path)
          const previous = map[key]
          map[key] = {
            pageViews: (previous?.pageViews ?? 0) + row.pageViews,
            sessions: (previous?.sessions ?? 0) + row.sessions,
          }
        }
        setTraffic(map)
        setStatus('done')
      } catch (caught) {
        setError({ message: caught instanceof Error ? caught.message : String(caught) })
        setStatus('error')
      }
    })()
  }, [paths, setTraffic])

  const clear = useCallback(() => {
    setTraffic({})
    setStatus('idle')
    setError(null)
  }, [setTraffic])

  return { status, traffic, error, paths, load, clear }
}