/**
 * The crawl loop.
 *
 * The loop owns the mutable structures that the reducer deliberately does not:
 *  - `queue`:    the FIFO of URLs still to visit;
 *  - `seen`:     every URL ever queued, the deduplication source of truth;
 *  - `attempts`: per-URL failure counts, used by the retry policy.
 *
 * Requests are issued with a configurable concurrency but a **global start pace**:
 * one request starts every `delayMs`, with at most `concurrency` in flight. That
 * keeps the load on the target site predictable while still parallelising slow pages.
 *
 * 抓取迴圈。迴圈擁有 reducer 刻意不持有的可變結構：
 *  - `queue`：待抓取的 URL FIFO；
 *  - `seen` ：曾入列的所有 URL，去重的唯一依據；
 *  - `attempts`：每個 URL 的失敗次數，供重試策略使用。
 * 請求以可設定的並發數發出，但**全域啟動節奏**固定：每 `delayMs` 啟動一個請求，
 * 同時最多 `concurrency` 個在途，兼顧對目標站的可預期負載與慢頁面的平行化。
 */
import { normalizeUrl, shouldInclude } from '@/lib/url-utils'
import type { CrawlOptions } from '@/types/crawl'

import { PAUSE_POLL_MS } from './constants'
import { requestCrawlPage, type CrawlPageResult } from './request'
import type { CrawlAction, CrawlState } from './types'

/** Anything with a mutable `current`; structurally satisfied by React refs. */
interface Cell<T> {
  current: T
}

/**
 * Mutable state shared between the hook and the loop.
 * Declared structurally so the engine can be unit-tested without React.
 */
export interface CrawlEngineRefs {
  /** Latest reducer state, refreshed after every render. */
  state: Cell<CrawlState>
  /** Latest options, so mid-run changes take effect on the next page. */
  options: Cell<CrawlOptions>
  /** Pause flag written synchronously by the click handler. */
  control: Cell<{ paused: boolean }>
  /** FIFO of pending URLs. */
  queue: Cell<string[]>
  /** Every URL ever queued (dedup set). */
  seen: Cell<Set<string>>
  /** Failure attempts per URL (retry bookkeeping). */
  attempts: Cell<Map<string, number>>
  /** Abort handle; replaced whenever a task is stopped/restarted. */
  abort: Cell<AbortController>
  /** Guard so two loops can never run at once. */
  running: Cell<boolean>
}

/** Injectable collaborators, overridden in tests. */
export interface CrawlEngineDeps {
  /** Reducer dispatcher. */
  dispatch: (action: CrawlAction) => void
  /** Delay helper (defaults to `setTimeout`). */
  sleep?: (ms: number) => Promise<void>
  /** HTTP layer (defaults to the real `/api/crawl` call). */
  request?: (
    body: Parameters<typeof requestCrawlPage>[0],
    signal: AbortSignal,
  ) => Promise<CrawlPageResult>
  /** Clock, so tests get deterministic timestamps. */
  now?: () => number
}

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms)
  })
}

/**
 * Create the crawl loop bound to a set of refs.
 *
 * `run()` resolves when the queue drains, the task is stopped, or the page budget is
 * exhausted. Safe to call repeatedly: the `running` guard makes concurrent calls no-ops.
 */
export function createCrawlEngine(refs: CrawlEngineRefs, deps: CrawlEngineDeps) {
  const { dispatch } = deps
  const sleep = deps.sleep ?? defaultSleep
  const request = deps.request ?? requestCrawlPage
  const now = deps.now ?? Date.now

  /** Timestamp of the last request start, for global pacing. */
  let lastStartAt = 0

  /**
   * Register a URL as queued unless we have seen it before.
   *
   * @returns The URL to enqueue, or `null` when it is already known.
   */
  function registerUrl(url: string): string | null {
    if (refs.seen.current.has(url)) return null
    refs.seen.current.add(url)
    return url
  }

  /**
   * Seed the queue with a start URL and its slash-stripped alias, so an in-site
   * link to `/test` does not re-queue the `/test/` page we are already visiting.
   */
  function seedQueue(startUrl: string): void {
    refs.queue.current = []
    refs.seen.current = new Set()
    refs.attempts.current = new Map()

    const primary = registerUrl(startUrl)
    if (primary) refs.queue.current.push(primary)

    const alias = normalizeUrl(startUrl, startUrl, { stripQuery: false })
    if (alias && alias !== startUrl) registerUrl(alias)
  }

  /**
   * Rebuild the queue from a persisted snapshot.
   *
   * @param queue     URLs that were still pending when the page was left.
   * @param startUrl  Start URL of the restored task, used to re-register the alias.
   * @param knownUrls Every URL already present in the snapshot's archive.
   */
  function restoreQueue(queue: string[], startUrl: string, knownUrls: string[]): void {
    refs.seen.current = new Set(knownUrls)
    refs.attempts.current = new Map()

    const alias = normalizeUrl(startUrl, startUrl, { stripQuery: false })
    if (alias) refs.seen.current.add(alias)

    // Anything already in the archive must not be crawled twice.
    refs.queue.current = queue.filter((url) => !refs.seen.current.has(url))
  }

  /** Wait until the global start pace allows the next request. */
  async function pace(delayMs: number): Promise<void> {
    if (delayMs <= 0) return
    const wait = delayMs - (Date.now() - lastStartAt)
    if (wait > 0) await sleep(wait)
    lastStartAt = Date.now()
  }

  /** Fire one request, converting rejections into a failed result. */
  async function fire(
    url: string,
    signal: AbortSignal,
  ): Promise<{ url: string; result: CrawlPageResult }> {
    const { task, options } = refs.state.current
    if (!task) {
      return { url, result: { ok: false, message: 'task is gone' } }
    }

    try {
      const result = await request(
        {
          url,
          origin: task.origin,
          pathPrefix: task.pathPrefix,
          stripQuery: options.stripQuery,
        },
        signal,
      )
      return { url, result }
    } catch (error) {
      return {
        url,
        result: { ok: false, message: error instanceof Error ? error.message : String(error) },
      }
    }
  }

  /**
   * Remember a redirect target so it is not crawled a second time.
   *
   * A link discovered *after* the target was already crawled can still cost one
   * request; this only prevents the reverse order (target linked first).
   */
  function registerFinalUrl(finalUrl: string): void {
    const { task, options } = refs.state.current
    if (!task) return

    const normalized = normalizeUrl(finalUrl, finalUrl, { stripQuery: options.stripQuery })
    if (!normalized) return
    if (!shouldInclude(normalized, task.origin, task.pathPrefix)) return

    registerUrl(normalized)
  }

  /** Collect the newly discovered links of a successful page. */
  function collectDiscovered(links: readonly string[]): string[] {
    const discovered: string[] = []
    for (const link of links) {
      const registered = registerUrl(link)
      if (registered) discovered.push(registered)
    }
    if (discovered.length > 0) refs.queue.current.push(...discovered)
    return discovered
  }

  async function run(): Promise<void> {
    if (refs.running.current) return
    refs.running.current = true

    /** Pages processed in this run; compared against `maxPages`. Retries do not count. */
    let processed = 0

    try {
      for (;;) {
        const controller = refs.abort.current
        if (controller.signal.aborted) break

        // Pause: park between two pages so in-flight requests are never killed.
        // `control` covers manual pauses (synchronous), `state` covers auto-pause.
        while (refs.control.current.paused || refs.state.current.phase === 'paused') {
          if (controller.signal.aborted) break
          await sleep(PAUSE_POLL_MS)
        }
        if (controller.signal.aborted) break

        const { options } = refs.state.current
        const concurrency = Math.max(1, options.concurrency)

        // An empty queue means the crawl is genuinely finished — check it before the
        // budget so a site with exactly `maxPages` pages reports "done", not "limit".
        if (refs.queue.current.length === 0) {
          dispatch({ type: 'task/finish', now: now() })
          break
        }

        const remaining = options.maxPages - processed
        if (remaining <= 0) {
          dispatch({
            type: 'task/stop',
            reason: { key: 'log.task.limitReached', params: { max: options.maxPages } },
            now: now(),
          })
          refs.abort.current.abort()
          break
        }

        // Take a batch without exceeding the remaining page budget.
        const batchSize = Math.min(concurrency, remaining)
        const batch: string[] = []
        while (batch.length < batchSize) {
          const next = refs.queue.current.shift()
          if (!next) break
          batch.push(next)
        }

        const inFlight: Array<Promise<{ url: string; result: CrawlPageResult }>> = []
        for (const url of batch) {
          dispatch({
            type: 'page/start',
            url,
            pendingCount: refs.queue.current.length,
            now: now(),
          })

          // Global start pacing keeps one request starting every `delayMs`.
          await pace(options.delayMs)
          if (controller.signal.aborted) break

          inFlight.push(fire(url, controller.signal))
        }

        const settled = await Promise.all(inFlight)
        if (controller.signal.aborted) break

        for (const { url, result } of settled) {
          if (controller.signal.aborted) break

          if (result.ok) {
            registerFinalUrl(result.response.finalUrl)
            const discovered = collectDiscovered(result.response.links)
            processed += 1
            dispatch({
              type: 'page/result',
              url,
              ok: true,
              response: result.response,
              discovered,
              pendingCount: refs.queue.current.length,
              now: now(),
            })
            continue
          }

          // Failure: retry while attempts remain, otherwise record it as failed.
          const spent = (refs.attempts.current.get(url) ?? 0) + 1
          if (spent <= options.retryCount) {
            refs.attempts.current.set(url, spent)
            // Re-queue directly: `registerUrl` would refuse a URL already in `seen`.
            refs.queue.current.push(url)
            dispatch({
              type: 'page/requeue',
              url,
              attempt: spent,
              max: options.retryCount,
              pendingCount: refs.queue.current.length,
              now: now(),
            })
            continue
          }

          processed += 1
          dispatch({
            type: 'page/result',
            url,
            ok: false,
            message: result.message,
            discovered: [],
            pendingCount: refs.queue.current.length,
            now: now(),
          })
        }
      }
    } finally {
      refs.running.current = false
    }
  }

  return { run, seedQueue, restoreQueue }
}

/** Drop every queued URL, the dedup set and the retry bookkeeping. */
export function clearQueue(
  refs: Pick<CrawlEngineRefs, 'queue' | 'seen' | 'attempts'>,
): void {
  refs.queue.current = []
  refs.seen.current = new Set()
  refs.attempts.current = new Map()
}