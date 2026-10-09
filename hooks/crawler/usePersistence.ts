/**
 * Resume-after-refresh support ("断点续爬").
 *
 * Two effects live here:
 *  1. On mount, rehydrate a saved snapshot (always landing in the paused phase).
 *  2. On every meaningful change, debounce-write the snapshot.
 *
 * The write effect deliberately keys off a compact signature instead of the whole
 * state: the state object changes every second (the sampler), and we do not want a
 * localStorage write per tick.
 *
 * 斷點續爬。兩個 effect：一個在掛載時還原快照（必定停在暫停狀態），
 * 另一個在有實質變化時防抖寫入。寫入刻意以精簡簽章為依賴，
 * 因為狀態每秒都在變（取樣計時器），我們不想每秒都寫 localStorage。
 */
import { useEffect, useMemo, useRef } from 'react'
import type { Dispatch } from 'react'

import { loadSnapshot, saveSnapshot } from '@/lib/persistence'
import type { UrlRecord } from '@/types/crawl'

import { DEFAULT_OPTIONS, PERSIST_DEBOUNCE_MS } from './constants'
import type { CrawlEngineRefs } from './engine'
import type { CrawlAction, CrawlState } from './types'

export interface UseCrawlerPersistenceParams {
  /** Current reducer state. */
  state: CrawlState
  /** Reducer dispatcher. */
  dispatch: Dispatch<CrawlAction>
  /** Engine refs, so the queue can be rebuilt on restore. */
  refs: CrawlEngineRefs
  /** Rebuild the engine queue from a snapshot. */
  restoreQueue: (queue: string[], startUrl: string, knownUrls: string[]) => void
  /** Surface quota / availability problems in the UI. */
  setPersistError: (message: string | null) => void
}

/**
 * Wire snapshot persistence into the hook.
 *
 * Must be called unconditionally once per `useCrawler()` instance.
 */
export function useCrawlerPersistence({
  state,
  dispatch,
  refs,
  restoreQueue,
  setPersistError,
}: UseCrawlerPersistenceParams): void {
  /** So the "SEO data was not persisted" notice is logged only once. */
  const seoDroppedRef = useRef(false)

  // Compact signature: only these changes are worth persisting.
  const persistKey = useMemo(
    () =>
      [
        state.records.size,
        state.pendingCount,
        state.stats.requests,
        state.stats.skippedLinks,
        state.options.maxPages,
        state.options.delayMs,
        state.options.stripQuery ? 1 : 0,
        state.options.includeLastmod ? 1 : 0,
        state.options.includePriority ? 1 : 0,
        state.options.includeChangefreq ? 1 : 0,
        state.options.changefreq,
        state.logs.length,
      ].join('|'),
    [
      state.records.size,
      state.pendingCount,
      state.stats,
      state.options,
      state.logs.length,
    ],
  )

  // ---- Restore once on mount ----
  useEffect(() => {
    const snapshot = loadSnapshot()
    if (!snapshot || snapshot.records.length === 0) return

    restoreQueue(
      snapshot.queue ?? [],
      snapshot.task.startUrl,
      snapshot.records.map((record) => record.url),
    )

    dispatch({
      type: 'task/restore',
      task: snapshot.task,
      // Merge with defaults: snapshots written by older versions lack the newer
      // export switches, and undefined would make the controlled switches flip.
      options: { ...DEFAULT_OPTIONS, ...snapshot.options },
      queue: snapshot.queue ?? [],
      records: snapshot.records,
      logs: snapshot.logs ?? [],
      logSeq: snapshot.logSeq ?? 0,
      stats: snapshot.stats,
      history: snapshot.history ?? [],
      now: Date.now(),
    })
    // Mount-only by design; re-running would fight the user's own start/stop clicks.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ---- Debounced write ----
  useEffect(() => {
    const task = state.task
    if (!task || state.records.size === 0) return

    const timer = setTimeout(() => {
      const records: UrlRecord[] = []
      for (const url of state.order) {
        const record = state.records.get(url)
        if (record) records.push(record)
      }

      const result = saveSnapshot({
        task,
        options: state.options,
        queue: refs.queue.current,
        records,
        logs: state.logs,
        logSeq: state.logSeq,
        stats: state.stats,
        history: state.history,
      })

      setPersistError(result.ok ? null : `本地保存失败（${result.reason}），刷新后将无法断点续爬`)

      // Tell the user once when the SEO audit data had to be dropped for quota.
      if (result.ok && result.seoDropped && !seoDroppedRef.current) {
        seoDroppedRef.current = true
        dispatch({
          type: 'logs/add',
          drafts: [{ level: 'warn', key: 'log.persist.seoDropped' }],
          now: Date.now(),
        })
      }
    }, PERSIST_DEBOUNCE_MS)

    return () => clearTimeout(timer)
    // Intentionally keyed on `persistKey` only — see the comment above.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [persistKey])
}