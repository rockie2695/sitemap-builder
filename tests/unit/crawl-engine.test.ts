/**
 * Unit tests for the crawl engine (`hooks/crawler/engine.ts`).
 *
 * The engine takes injectable collaborators, so these tests drive a full crawl
 * with a fake HTTP layer and fake timers — no React, no network.
 *
 * 抓取引擎（`hooks/crawler/engine.ts`）的單元測試。
 * 引擎的協作者皆可注入，因此可用假的 HTTP 層與計時器跑完整抓取——不需要 React 與網路。
 */
import { describe, expect, it } from 'vitest'

import { crawlReducer, initialCrawlState } from '@/hooks/crawler/reducer'
import type { CrawlEngineRefs } from '@/hooks/crawler/engine'
import { clearQueue, createCrawlEngine } from '@/hooks/crawler/engine'
import type { CrawlAction, CrawlState } from '@/hooks/crawler/types'
import { DEFAULT_OPTIONS } from '@/hooks/crawler/constants'
import type { CrawlPageResult } from '@/hooks/crawler/request'
import type { CrawlRequest, CrawlResponsePayload } from '@/types/crawl'

const T0 = 1_000_000

/** Deterministic sleep: resolves immediately but records the requested delay. */
function fakeSleep(delays: number[]) {
  return (ms: number) => {
    delays.push(ms)
    return Promise.resolve()
  }
}

/** Wiring for one test run.
 *
 * @param request   Fake HTTP layer.
 * @param options   Crawl options; override `maxPages` to test the page budget.
 * @param realSleep Use the real `setTimeout` instead of an instant fake — required
 *                  for pause tests, where an instantly-resolving sleep would busy-spin.
 */
type FakeRequest = (
  body: CrawlRequest,
  signal: AbortSignal,
) => Promise<CrawlPageResult>

function harness(
  request: FakeRequest,
  options: typeof DEFAULT_OPTIONS = DEFAULT_OPTIONS,
  realSleep = false,
) {
  const stateRef = { current: initialCrawlState as CrawlState }
  const actions: CrawlAction[] = []
  const delays: number[] = []

  const refs: CrawlEngineRefs = {
    state: stateRef,
    options: { current: options },
    control: { current: { paused: false } },
    queue: { current: [] },
    seen: { current: new Set() },
    abort: { current: new AbortController() },
    attempts: { current: new Map<string, number>() },
    running: { current: false },
  }

  const engine = createCrawlEngine(refs, {
    dispatch: (action) => {
      actions.push(action)
      stateRef.current = crawlReducer(stateRef.current, action)
    },
    sleep: realSleep
      ? (ms) => new Promise((resolve) => setTimeout(resolve, ms))
      : fakeSleep(delays),
    now: (() => {
      let clock = T0
      return () => (clock += 1000)
    })(),
    request: (body, signal) => request(body, signal),
  })

  return { refs, engine, actions, stateRef, delays }
}

/**
 * Seed the queue AND dispatch `task/start`, mirroring the real `start()` order.
 *
 * The reducer's `page/start` branch ignores URLs that have no archive record, so a
 * bare `seedQueue()` (without the task/start dispatch) would make every page a no-op.
 */
function harnessWithTask(
  request: FakeRequest,
  startUrl = 'https://example.com/test/',
  options: typeof DEFAULT_OPTIONS = DEFAULT_OPTIONS,
  realSleep = false,
) {
  const h = harness(request, options, realSleep)
  h.refs.state.current = crawlReducer(h.refs.state.current, {
    type: 'task/start',
    task: { startUrl, origin: 'https://example.com', pathPrefix: '/test' },
    options,
    now: T0,
  })
  return h
}

/**
 * A page response with the given links.
 *
 * `self` must be the URL that was requested: the engine registers `finalUrl` as
 * already-seen, so a placeholder value here would suppress a legitimate link.
 */
const page = (
  links: string[],
  self = 'https://example.com/',
): { ok: true; response: CrawlResponsePayload } => ({
  ok: true,
  response: {
    links,
    skippedLinks: 0,
    pageUrl: self,
    finalUrl: self,
    pageTitle: null,
    httpStatus: 200,
    lastModified: null,
    durationMs: 100,
  },
})

describe('createCrawlEngine / 抓取迴圈', () => {
  it('crawls breadth-first until the queue drains / 廣度優先抓取直到佇列清空', async () => {
    const requested: string[] = []
    const { refs, engine, stateRef } = harnessWithTask(async (body) => {
      requested.push(body.url)
      if (body.url.endsWith('/test/')) {
        return page(['https://example.com/test/a.html', 'https://example.com/test/b.html'], body.url)
      }
      return page([], body.url) // leaf pages have no outbound links
    })

    engine.seedQueue('https://example.com/test/')
    await engine.run()

    expect(requested).toEqual([
      'https://example.com/test/',
      'https://example.com/test/a.html',
      'https://example.com/test/b.html',
    ])
    expect(stateRef.current.phase).toBe('done')
    expect(refs.queue.current).toHaveLength(0)
  })

  it('de-duplicates: a link seen twice is fetched once / 去重：重複連結只抓一次', async () => {
    const requested: string[] = []
    const { engine, stateRef } = harnessWithTask(async (body) => {
      requested.push(body.url)
      if (body.url.endsWith('/test/')) {
        return page(
          [
            'https://example.com/test/a.html',
            'https://example.com/test/a.html', // duplicate within one page
          ],
          body.url,
        )
      }
      return page(['https://example.com/test/'], body.url) // links back to the start
    })

    engine.seedQueue('https://example.com/test/')
    await engine.run()

    expect(requested).toEqual(['https://example.com/test/', 'https://example.com/test/a.html'])
    expect(stateRef.current.records.size).toBe(2)
  })

  it('seeds the slash-stripped alias so /test is not re-queued / 註冊去斜線別名', async () => {
    const requested: string[] = []
    const { engine, stateRef } = harnessWithTask(async (body) => {
      requested.push(body.url)
      return page(['https://example.com/test'], body.url) // site links to the un-slashed form
    })

    engine.seedQueue('https://example.com/test/')
    await engine.run()

    expect(requested).toEqual(['https://example.com/test/'])
    expect(stateRef.current.records.size).toBe(1)
  })

  it('stops at the page budget / 達到頁數上限即停止', async () => {
    const requested: string[] = []
    const { engine, stateRef } = harnessWithTask(
      async (body) => {
        requested.push(body.url)
        // An endless site: every page links to one more, so the queue is never empty.
        return page([`https://example.com/p${requested.length}`], body.url)
      },
      'https://example.com/p0',
      { ...DEFAULT_OPTIONS, maxPages: 2 },
    )

    engine.seedQueue('https://example.com/p0')
    await engine.run()

    expect(stateRef.current.phase).toBe('stopped')
    const stop = stateRef.current.logs.find((entry) => entry.key === 'log.task.limitReached')
    expect(stop).toBeDefined()
    expect(requested).toHaveLength(2) // the budget was respected
  })

  it('never runs two loops at once / 不會同時跑兩個迴圈', async () => {
    const { engine } = harnessWithTask(async (body) => page([], body.url), 'https://example.com/')
    engine.seedQueue('https://example.com/')
    await Promise.all([engine.run(), engine.run()])
    // Both resolved without throwing; the guard made the second a no-op.
  })

  it('clearQueue drops the FIFO and the dedup set / clearQueue 清空佇列與去重集合', () => {
    const refs: CrawlEngineRefs = {
      state: { current: initialCrawlState },
      options: { current: DEFAULT_OPTIONS },
      control: { current: { paused: false } },
      queue: { current: ['https://example.com/a'] },
      seen: { current: new Set(['https://example.com/a']) },
      abort: { current: new AbortController() },
      attempts: { current: new Map<string, number>() },
      running: { current: false },
    }
    clearQueue(refs)
    expect(refs.queue.current).toHaveLength(0)
    expect(refs.seen.current.size).toBe(0)
  })

  it('honours the pause flag between pages / 在兩頁之間遵守暫停旗標', async () => {
    const { refs, engine, stateRef } = harnessWithTask(
      async (body) => page(['https://example.com/test/a.html', 'https://example.com/test/b.html'], body.url),
      'https://example.com/test/',
      DEFAULT_OPTIONS,
      true, // real sleep: the pause wait must yield to the event loop
    )

    engine.seedQueue('https://example.com/test/')

    // Start paused: the loop must not fetch anything while the flag is set.
    refs.control.current.paused = true
    const runPromise = engine.run()
    // Give the loop a moment to reach the pause wait (poll = 150ms).
    await new Promise((resolve) => setTimeout(resolve, 300))
    expect(stateRef.current.records.get('https://example.com/test/')?.status).toBe('queued')
    expect(stateRef.current.phase).toBe('running')

    // Resume: the loop continues and drains the queue.
    refs.control.current.paused = false
    await runPromise

    expect(stateRef.current.phase).toBe('done')
    expect(stateRef.current.records.size).toBe(3)
  })
})

describe('retry / 失敗重試', () => {
  const target = 'https://example.com/test/'

  it('re-queues a failed page until it succeeds / 失敗頁面重試後成功', async () => {
    let attempts = 0
    const { engine, stateRef } = harnessWithTask(
      async (body) => {
        attempts += 1
        if (attempts === 1) return { ok: false, message: 'flaky' }
        return page([], body.url)
      },
      target,
      { ...DEFAULT_OPTIONS, retryCount: 1 },
    )

    engine.seedQueue(target)
    await engine.run()

    expect(attempts).toBe(2)
    expect(stateRef.current.records.get(target)?.status).toBe('done')
    // Only the successful attempt counts toward requests / 只有成功那次計入 requests。
    expect(stateRef.current.stats.requests).toBe(1)
    expect(stateRef.current.logs.some((entry) => entry.key === 'log.page.retry')).toBe(true)
  })

  it('gives up after the configured attempts / 用盡重試次數後標記失敗', async () => {
    let attempts = 0
    const { engine, stateRef } = harnessWithTask(
      async () => {
        attempts += 1
        return { ok: false, message: 'down' }
      },
      target,
      { ...DEFAULT_OPTIONS, retryCount: 2 },
    )

    engine.seedQueue(target)
    await engine.run()

    expect(attempts).toBe(3) // the first try plus two retries
    expect(stateRef.current.records.get(target)?.status).toBe('failed')
    expect(stateRef.current.stats.requests).toBe(1)
    // Retries do not feed the auto-pause counter / 重試不計入自動暫停的連續失敗數。
    expect(stateRef.current.stats.consecutiveErrors).toBe(1)
  })

  it('does not retry when retryCount is 0 / retryCount 為 0 時不重試', async () => {
    let attempts = 0
    const { engine, stateRef } = harnessWithTask(async () => {
      attempts += 1
      return { ok: false, message: 'down' }
    })

    engine.seedQueue(target)
    await engine.run()

    expect(attempts).toBe(1)
    expect(stateRef.current.records.get(target)?.status).toBe('failed')
  })

  it('retries do not consume the page budget / 重試不佔頁數上限', async () => {
    let attempts = 0
    const { engine, stateRef } = harnessWithTask(
      async (body) => {
        attempts += 1
        if (body.url === target && attempts === 1) return { ok: false, message: 'flaky' }
        return page(body.url === target ? ['https://example.com/test/a'] : [], body.url)
      },
      target,
      { ...DEFAULT_OPTIONS, retryCount: 1, maxPages: 2 },
    )

    engine.seedQueue(target)
    await engine.run()

    // Two unique pages (target + a), one of which needed a retry.
    expect(stateRef.current.phase).toBe('done')
    expect(stateRef.current.records.size).toBe(2)
  })
})

describe('concurrency / 並發', () => {
  const target = 'https://example.com/test/'

  it('runs up to N requests in flight / 最多同時 N 個在途請求', async () => {
    const started: string[] = []
    let inFlight = 0
    let maxInFlight = 0

    const { engine, stateRef } = harnessWithTask(
      async (body) => {
        started.push(body.url)
        inFlight += 1
        maxInFlight = Math.max(maxInFlight, inFlight)
        await new Promise((resolve) => setTimeout(resolve, 5))
        inFlight -= 1
        if (body.url === target) {
          return page(
            [
              'https://example.com/test/a',
              'https://example.com/test/b',
              'https://example.com/test/c',
            ],
            body.url,
          )
        }
        return page([], body.url)
      },
      target,
      { ...DEFAULT_OPTIONS, concurrency: 3 },
    )

    engine.seedQueue(target)
    await engine.run()

    expect(maxInFlight).toBeGreaterThan(1)
    expect(maxInFlight).toBeLessThanOrEqual(3)
    expect([...started].sort()).toEqual(
      [
        target,
        'https://example.com/test/a',
        'https://example.com/test/b',
        'https://example.com/test/c',
      ].sort(),
    )
    expect(stateRef.current.records.size).toBe(4)
    expect(stateRef.current.phase).toBe('done')
  })

  it('still respects the page budget under concurrency / 並發下仍遵守頁數上限', async () => {
    const started: string[] = []
    const { engine, stateRef } = harnessWithTask(
      async (body) => {
        started.push(body.url)
        return page(
          body.url === target
            ? ['https://example.com/test/a', 'https://example.com/test/b', 'https://example.com/test/c']
            : [],
          body.url,
        )
      },
      target,
      { ...DEFAULT_OPTIONS, concurrency: 3, maxPages: 2 },
    )

    engine.seedQueue(target)
    await engine.run()

    expect(started).toHaveLength(2)
    expect(stateRef.current.phase).toBe('stopped')
  })
})

describe('redirect handling / 重定向', () => {
  const target = 'https://example.com/test/'

  it('registers the final URL so it is not crawled twice / 登記最終位址避免重複抓取', async () => {
    const oldUrl = 'https://example.com/test/old'
    const newUrl = 'https://example.com/test/new'
    const requested: string[] = []

    const { engine, stateRef } = harnessWithTask(
      async (body) => {
        requested.push(body.url)
        if (body.url === target) return page([oldUrl], body.url)
        // `/old` redirects to `/new` and the final page links to itself.
        if (body.url === oldUrl) return page([newUrl], newUrl)
        return page([], body.url)
      },
      target,
    )

    engine.seedQueue(target)
    await engine.run()

    // `/new` was registered as the redirect target, so the link to it is dropped.
    expect(requested).toEqual([target, oldUrl])
    expect(stateRef.current.records.size).toBe(2)
    expect(stateRef.current.records.get(oldUrl)?.finalUrl).toBe(newUrl)
  })
})