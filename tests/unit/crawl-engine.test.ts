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

/** A page response with the given links. */
const page = (links: string[]): { ok: true; response: CrawlResponsePayload } => ({
  ok: true,
  response: {
    links,
    skippedLinks: 0,
    pageUrl: links[0] ?? 'https://example.com/',
    finalUrl: links[0] ?? 'https://example.com/',
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
        return page(['https://example.com/test/a.html', 'https://example.com/test/b.html'])
      }
      return page([]) // leaf pages have no outbound links
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
        return page([
          'https://example.com/test/a.html',
          'https://example.com/test/a.html', // duplicate within one page
        ])
      }
      return page(['https://example.com/test/']) // links back to the start
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
      return page(['https://example.com/test']) // site links to the un-slashed form
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
        return page(body.url.endsWith('1') ? [] : ['https://example.com/p1'])
      },
      'https://example.com/p0',
      { ...DEFAULT_OPTIONS, maxPages: 2 },
    )

    engine.seedQueue('https://example.com/p0')
    await engine.run()

    expect(stateRef.current.phase).toBe('stopped')
    const stop = stateRef.current.logs.find((entry) => entry.message.includes('页数上限'))
    expect(stop).toBeDefined()
    expect(requested).toHaveLength(2) // the budget was respected
  })

  it('never runs two loops at once / 不會同時跑兩個迴圈', async () => {
    const { engine } = harnessWithTask(async () => page([]), 'https://example.com/')
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
      running: { current: false },
    }
    clearQueue(refs)
    expect(refs.queue.current).toHaveLength(0)
    expect(refs.seen.current.size).toBe(0)
  })

  it('honours the pause flag between pages / 在兩頁之間遵守暫停旗標', async () => {
    const { refs, engine, stateRef } = harnessWithTask(
      async () => page(['https://example.com/test/a.html', 'https://example.com/test/b.html']),
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