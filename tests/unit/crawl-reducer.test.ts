/**
 * State-machine tests for `crawlReducer` (`hooks/crawler/reducer.ts`).
 *
 * The reducer is pure, so these tests drive it directly without React or mocks.
 *
 * `crawlReducer`（`hooks/crawler/reducer.ts`）的狀態機測試。
 * reducer 是純函式，因此直接驅動即可，不需要 React 或 mock。
 */
import { describe, expect, it } from 'vitest'

import { DEFAULT_OPTIONS } from '@/hooks/crawler/constants'
import { crawlReducer, initialCrawlState, settleCrawling } from '@/hooks/crawler/reducer'
import type { CrawlState } from '@/hooks/crawler/types'
import type { CrawlResponsePayload, CrawlTaskMeta } from '@/types/crawl'

const NOW = 1_000_000
const TASK: CrawlTaskMeta = {
  startUrl: 'https://example.com/test/',
  origin: 'https://example.com',
  pathPrefix: '/test',
}

/** A successful crawl response. */
const okResponse: CrawlResponsePayload = {
  links: ['https://example.com/test/a.html', 'https://example.com/test/b.html'],
  skippedLinks: 1,
  pageUrl: 'https://example.com/test/',
  finalUrl: 'https://example.com/test/',
  pageTitle: '首页',
  httpStatus: 200,
  lastModified: null,
  durationMs: 1200,
}

/** Start a task and return the resulting state. */
function started(): CrawlState {
  return crawlReducer(initialCrawlState, {
    type: 'task/start',
    task: TASK,
    options: DEFAULT_OPTIONS,
    now: NOW,
  })
}

describe('task lifecycle / 任務生命週期', () => {
  it('starts with the start URL queued at depth 0 / 起始網址入列且深度 0', () => {
    const state = started()
    expect(state.phase).toBe('running')
    expect(state.task).toEqual(TASK)
    expect(state.records.get(TASK.startUrl)?.depth).toBe(0)
    expect(state.pendingCount).toBe(1)
    expect(state.stats.startedAt).toBe(NOW)
    expect(state.logs.length).toBe(2)
  })

  it('marks the page crawling on page/start / 標記為抓取中', () => {
    const state = crawlReducer(started(), { type: 'page/start', url: TASK.startUrl, pendingCount: 0, now: NOW })
    expect(state.records.get(TASK.startUrl)?.status).toBe('crawling')
    expect(state.currentUrl).toBe(TASK.startUrl)
  })

  it('records a success and adds discovered links one level deeper / 記錄成功並加入下一層連結', () => {
    const state = crawlReducer(
      crawlReducer(started(), { type: 'page/start', url: TASK.startUrl, pendingCount: 0, now: NOW }),
      {
        type: 'page/result',
        url: TASK.startUrl,
        ok: true,
        response: okResponse,
        discovered: okResponse.links,
        pendingCount: 2,
        now: NOW + 1500,
      },
    )

    const record = state.records.get(TASK.startUrl)
    expect(record?.status).toBe('done')
    expect(record?.httpStatus).toBe(200)
    expect(record?.pageTitle).toBe('首页')
    expect(record?.foundLinks).toBe(2)
    expect(record?.durationMs).toBe(1200)
    expect(state.stats.requests).toBe(1)
    expect(state.stats.skippedLinks).toBe(1)
    // Discovered links got their own records at depth 1.
    expect(state.records.get('https://example.com/test/a.html')?.depth).toBe(1)
    expect(state.order).toHaveLength(3)
  })

  it('flags a record whose fetch ended on another URL / 標記被重定向的記錄', () => {
    const state = crawlReducer(
      crawlReducer(started(), { type: 'page/start', url: TASK.startUrl, pendingCount: 0, now: NOW }),
      {
        type: 'page/result',
        url: TASK.startUrl,
        ok: true,
        response: { ...okResponse, finalUrl: 'https://example.com/test/moved' },
        discovered: [],
        pendingCount: 0,
        now: NOW + 1500,
      },
    )
    expect(state.records.get(TASK.startUrl)?.redirected).toBe(true)
  })

  it('does not flag a trailing-slash-only difference / 僅差末尾斜線不算重定向', () => {
    const state = crawlReducer(
      crawlReducer(started(), { type: 'page/start', url: TASK.startUrl, pendingCount: 0, now: NOW }),
      {
        type: 'page/result',
        url: TASK.startUrl,
        ok: true,
        response: { ...okResponse, finalUrl: 'https://example.com/test' },
        discovered: [],
        pendingCount: 0,
        now: NOW + 1500,
      },
    )
    expect(state.records.get(TASK.startUrl)?.redirected).toBe(false)
  })

  it('marks a reachable 404 as failed / 可達的 404 記為失敗', () => {
    const state = crawlReducer(
      crawlReducer(started(), { type: 'page/start', url: TASK.startUrl, pendingCount: 0, now: NOW }),
      {
        type: 'page/result',
        url: TASK.startUrl,
        ok: true,
        response: { ...okResponse, httpStatus: 404, pageTitle: null },
        discovered: okResponse.links,
        pendingCount: 0,
        now: NOW + 1500,
      },
    )
    expect(state.records.get(TASK.startUrl)?.status).toBe('failed')
    expect(state.records.get(TASK.startUrl)?.error).toBe('HTTP 404')
    // Links are still collected from a 404 page.
    expect(state.records.get('https://example.com/test/a.html')).toBeDefined()
  })

  it('records a transport failure / 記錄傳輸失敗', () => {
    const state = crawlReducer(
      crawlReducer(started(), { type: 'page/start', url: TASK.startUrl, pendingCount: 0, now: NOW }),
      {
        type: 'page/result',
        url: TASK.startUrl,
        ok: false,
        message: 'ERR_CONNECTION_REFUSED',
        discovered: [],
        pendingCount: 0,
        now: NOW + 1500,
      },
    )
    expect(state.records.get(TASK.startUrl)?.status).toBe('failed')
    expect(state.records.get(TASK.startUrl)?.error).toBe('ERR_CONNECTION_REFUSED')
    expect(state.stats.consecutiveErrors).toBe(1)
  })

  it('auto-pauses after 5 consecutive failures / 連續 5 次失敗後自動暫停', () => {
    let state = started()
    state = crawlReducer(state, { type: 'page/start', url: TASK.startUrl, pendingCount: 0, now: NOW })

    for (let i = 1; i <= 5; i += 1) {
      state = crawlReducer(state, {
        type: 'page/result',
        url: TASK.startUrl,
        ok: false,
        message: 'timeout',
        discovered: [],
        pendingCount: 0,
        now: NOW + i * 1000,
      })
      // The same URL is re-queued by the engine between failures in real runs.
      if (i < 5) {
        expect(state.phase).toBe('running')
        state = crawlReducer(state, { type: 'page/start', url: TASK.startUrl, pendingCount: 0, now: NOW })
      }
    }

    expect(state.phase).toBe('paused')
    expect(state.stats.consecutiveErrors).toBe(5)
    // The pause explanation is the newest log entry.
    expect(state.logs[state.logs.length - 1].key).toBe('log.page.autoPaused')
  })

  it('resets the error streak on success / 成功後重置連續錯誤', () => {
    let state = started()
    state = crawlReducer(state, {
      type: 'page/result',
      url: TASK.startUrl,
      ok: false,
      message: 'x',
      discovered: [],
      pendingCount: 0,
      now: NOW,
    })
    expect(state.stats.consecutiveErrors).toBe(1)
    state = crawlReducer(state, {
      type: 'page/result',
      url: TASK.startUrl,
      ok: true,
      response: okResponse,
      discovered: [],
      pendingCount: 0,
      now: NOW,
    })
    expect(state.stats.consecutiveErrors).toBe(0)
  })

  it('finishes when the queue drains / 佇列清空後結束', () => {
    const state = crawlReducer(started(), { type: 'task/finish', now: NOW + 5000 })
    expect(state.phase).toBe('done')
    expect(state.pendingCount).toBe(0)
    expect(state.stats.finishedAt).toBe(NOW + 5000)
  })

  it('finishing twice is a no-op / 重複結束無效果', () => {
    const once = crawlReducer(started(), { type: 'task/finish', now: NOW })
    const twice = crawlReducer(once, { type: 'task/finish', now: NOW })
    expect(twice.logs.length).toBe(once.logs.length)
  })
})

describe('stop settling / 停止收尾', () => {
  it('marks in-flight pages as failed on stop / 停止時把在途頁面記為失敗', () => {
    const crawling = crawlReducer(started(), { type: 'page/start', url: TASK.startUrl, pendingCount: 0, now: NOW })
    const stopped = crawlReducer(crawling, { type: 'task/stop', now: NOW + 100 })
    expect(stopped.phase).toBe('stopped')
    expect(stopped.records.get(TASK.startUrl)?.status).toBe('failed')
    expect(stopped.records.get(TASK.startUrl)?.error).toContain('Task stopped')
    expect(stopped.pendingCount).toBe(0)
  })

  it('also settles via settleCrawling directly / settleCrawling 直接收尾', () => {
    const records = new Map([
      ['a', { ...started().records.get(TASK.startUrl)!, url: 'a', status: 'crawling' as const }],
    ])
    const settled = settleCrawling(records, NOW, 'reason')
    expect(settled.get('a')?.status).toBe('failed')
    expect(settled.get('a')?.error).toBe('reason')
    // No crawling records left: the same map is returned untouched.
    expect(settleCrawling(settled, NOW, 'reason')).toBe(settled)
  })
})

describe('restore / 斷點還原', () => {
  it('lands in the paused phase with the queue mirrored / 還原後停在暫停並鏡射佇列', () => {
    const records = [
      started().records.get(TASK.startUrl)!,
      { ...started().records.get(TASK.startUrl)!, url: 'https://example.com/test/a.html', depth: 1 },
    ]
    const state = crawlReducer(initialCrawlState, {
      type: 'task/restore',
      task: TASK,
      options: DEFAULT_OPTIONS,
      queue: ['https://example.com/test/a.html'],
      records,
      logs: [],
      logSeq: 0,
      stats: { ...started().stats, requests: 1 },
      history: [],
      now: NOW,
    })

    expect(state.phase).toBe('paused')
    expect(state.pendingCount).toBe(1)
    expect(state.records.size).toBe(2)
    expect(state.restoredAt).toBe(NOW)
  })

  it('resumes into running / 恢復後進入執行', () => {
    const restored = crawlReducer(initialCrawlState, {
      type: 'task/restore',
      task: TASK,
      options: DEFAULT_OPTIONS,
      queue: [],
      records: [started().records.get(TASK.startUrl)!],
      logs: [],
      logSeq: 0,
      stats: started().stats,
      history: [],
      now: NOW,
    })
    expect(crawlReducer(restored, { type: 'task/resume', now: NOW }).phase).toBe('running')
  })
})

describe('options and logs / 選項與日誌', () => {
  it('merges option patches / 合併選項變更', () => {
    const state = crawlReducer(started(), { type: 'options/set', options: { maxPages: 50, includePriority: true } })
    expect(state.options.maxPages).toBe(50)
    expect(state.options.includePriority).toBe(true)
    expect(state.options.delayMs).toBe(DEFAULT_OPTIONS.delayMs) // untouched
  })

  it('keeps options across a reset / 重置後保留選項', () => {
    const changed = crawlReducer(started(), { type: 'options/set', options: { maxPages: 7 } })
    const reset = crawlReducer(changed, { type: 'task/reset', now: NOW })
    expect(reset.phase).toBe('idle')
    expect(reset.records.size).toBe(0)
    expect(reset.options.maxPages).toBe(7)
  })

  it('caps the log ring buffer / 日誌環形緩衝有上限', () => {
    let state = started()
    for (let i = 0; i < 4000; i += 1) {
      state = crawlReducer(state, { type: 'tick', now: NOW + i })
    }
    expect(state.history.length).toBe(3600) // history cap (HISTORY_LIMIT)
    state = crawlReducer(state, { type: 'logs/clear' })
    expect(state.logs).toHaveLength(0)
  })
})