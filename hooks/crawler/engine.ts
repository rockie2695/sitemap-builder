/**
 * The crawl loop.
 *
 * The loop owns two mutable structures that the reducer deliberately does not:
 *  - `queue`: the FIFO of URLs still to visit;
 *  - `seen`:  every URL ever queued, which is the deduplication source of truth.
 *
 * Keeping them here means the reducer stays a pure view-model builder and the UI
 * never has to know that a queue exists.
 *
 * 抓取迴圈。迴圈擁有兩個 reducer 刻意不持有的可變結構：
 *  - `queue`：待抓取的 URL FIFO；
 *  - `seen` ：曾入列的所有 URL，也就是去重的唯一依據。
 * 把它們放在這裡，reducer 就能維持純函式的視圖模型，介面也不必知道佇列的存在。
 */
import { normalizeUrl } from '@/lib/url-utils'
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
 * `run()` resolves when the queue drains, the task is stopped, or the page budget
 * is exhausted. Safe to call repeatedly: the `running` guard makes concurrent calls
 * no-ops.
 */
export function createCrawlEngine(refs: CrawlEngineRefs, deps: CrawlEngineDeps) {
  const { dispatch } = deps
  const sleep = deps.sleep ?? defaultSleep
  const request = deps.request ?? requestCrawlPage
  const now = deps.now ?? Date.now

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
    const alias = normalizeUrl(startUrl, startUrl, { stripQuery: false })
    if (alias) refs.seen.current.add(alias)

    // Anything already in the archive must not be crawled twice.
    refs.queue.current = queue.filter((url) => !refs.seen.current.has(url))
  }

  async function run(): Promise<void> {
    if (refs.running.current) return
    refs.running.current = true

    /** Pages processed in this run; compared against `maxPages`. */
    let processed = 0

    try {
      for (;;) {
        const controller = refs.abort.current
        if (controller.signal.aborted) break

        // Pause: park between two pages so an in-flight request is never killed.
        // `control` covers manual pauses (synchronous), `state` covers auto-pause.
        while (refs.control.current.paused || refs.state.current.phase === 'paused') {
          if (controller.signal.aborted) break
          await sleep(PAUSE_POLL_MS)
        }
        if (controller.signal.aborted) break

        const maxPages = refs.options.current.maxPages
        if (processed >= maxPages) {
          dispatch({ type: 'task/stop', reason: `已达到页数上限（${maxPages}）`, now: now() })
          refs.abort.current.abort()
          break
        }

        const url = refs.queue.current.shift()
        if (!url) {
          dispatch({ type: 'task/finish', now: now() })
          break
        }

        dispatch({ type: 'page/start', url, pendingCount: refs.queue.current.length, now: now() })

        // Politeness delay before hitting the target site.
        const delay = refs.options.current.delayMs
        if (delay > 0) await sleep(delay)
        if (controller.signal.aborted) break

        const { task, options } = refs.state.current
        if (!task) break

        let result: CrawlPageResult
        try {
          result = await request(
            {
              url,
              origin: task.origin,
              pathPrefix: task.pathPrefix,
              stripQuery: options.stripQuery,
            },
            controller.signal,
          )
        } catch (error) {
          if (controller.signal.aborted) break
          result = {
            ok: false,
            message: error instanceof Error ? error.message : String(error),
          }
        }

        processed += 1
        if (controller.signal.aborted) break

        // Discovery happens here, not in the reducer: the queue lives in the engine.
        const discovered: string[] = []
        for (const link of result.ok ? result.response.links : []) {
          const registered = registerUrl(link)
          if (registered) discovered.push(registered)
        }
        if (discovered.length > 0) refs.queue.current.push(...discovered)

        dispatch({
          type: 'page/result',
          url,
          ok: result.ok,
          message: result.ok ? undefined : result.message,
          response: result.ok ? result.response : undefined,
          discovered,
          pendingCount: refs.queue.current.length,
          now: now(),
        })
      }
    } finally {
      refs.running.current = false
    }
  }

  return { run, seedQueue, restoreQueue }
}

/** Drop every queued URL and forget the dedup set (used by stop / reset). */
export function clearQueue(refs: Pick<CrawlEngineRefs, 'queue' | 'seen'>): void {
  refs.queue.current = []
  refs.seen.current = new Set()
}