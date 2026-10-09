/**
 * Unit tests for the SERP queue loop.
 *
 * The loop is React-free: timing, formatting and error handling are injected, so the
 * whole run can be exercised with fakes.
 *
 * SERP 佇列迴圈的單元測試。迴圈與 React 無關，時間、格式化與錯誤處理皆可注入，
 * 因此能以假物件完整演練。
 */
import { describe, expect, it, vi } from 'vitest'

import { runSerpQueue, type SerpEngineDeps } from '@/hooks/serp/engine'
import type { SerpQuery, SerpResponse } from '@/types/serp'

/** A successful response. */
function ok(query: string, rank: number | null = 3): SerpResponse {
  return {
    query,
    engine: 'google',
    provider: 'playwright',
    rank,
    results: [{ position: 1, url: 'https://top.example.com/', title: 'Top', hostname: 'top.example.com' }],
    competitors: [],
  }
}

/** Two queries. */
const QUERIES: SerpQuery[] = [
  { query: 'alpha', url: 'https://example.com/a' },
  { query: 'beta', url: 'https://example.com/b' },
]

/** Build deps with sensible defaults and an injectable fetch. */
function deps(overrides: Partial<SerpEngineDeps> & { fetchOne: SerpEngineDeps['fetchOne'] }): SerpEngineDeps {
  return {
    queries: QUERIES,
    options: { engine: 'google', provider: 'auto', maxQueries: 20, analyzeTop: 0, minIntervalMs: 1_000 },
    onStart: vi.fn(),
    onCurrent: vi.fn(),
    onResult: vi.fn(),
    onError: vi.fn(),
    onFatal: vi.fn(),
    onDone: vi.fn(),
    shouldPause: () => false,
    signal: new AbortController().signal,
    sleep: vi.fn(async () => undefined),
    now: () => 0,
    ...overrides,
  }
}

describe('runSerpQueue / SERP 佇列', () => {
  it('stores every record and finishes / 儲存每筆記錄並完成', async () => {
    const d = deps({ fetchOne: async (entry) => ok(entry.query) })
    await runSerpQueue(d)

    expect(d.onStart).toHaveBeenCalledWith(2)
    expect(d.onCurrent).toHaveBeenCalledTimes(2)
    expect(d.onResult).toHaveBeenCalledTimes(2)
    expect(d.onResult).toHaveBeenCalledWith(
      QUERIES[0],
      expect.objectContaining({ query: 'alpha', rank: 3, provider: 'playwright' }),
    )
    expect(d.onDone).toHaveBeenCalledTimes(1)
    expect(d.onFatal).not.toHaveBeenCalled()
  })

  it('waits the minimum interval between queries, not before the first / 首查不等待，其後依間隔', async () => {
    const sleep = vi.fn(async () => undefined)
    const d = deps({ fetchOne: async (entry) => ok(entry.query), sleep })
    await runSerpQueue(d)
    expect(sleep).toHaveBeenCalledWith(1_000)
    expect(sleep).toHaveBeenCalledTimes(1)
  })

  it('continues past a recoverable error / 可恢復錯誤後繼續', async () => {
    const fetchOne = vi.fn(async (entry: SerpQuery) =>
      entry.query === 'alpha'
        ? ({ ...ok('alpha'), error: 'no results', errorCode: 'empty' } as SerpResponse)
        : ok(entry.query),
    )
    const d = deps({ fetchOne })
    await runSerpQueue(d)

    expect(d.onError).toHaveBeenCalledWith(QUERIES[0], 'empty', 'no results')
    expect(d.onResult).toHaveBeenCalledTimes(1)
    expect(d.onDone).toHaveBeenCalledTimes(1)
  })

  it('stops the run on a fatal error / 致命錯誤時停止', async () => {
    const fetchOne = vi.fn(async () => ({ ...ok('alpha'), error: 'blocked', errorCode: 'blocked' } as SerpResponse))
    const d = deps({ fetchOne })
    await runSerpQueue(d)

    expect(d.onFatal).toHaveBeenCalledWith(QUERIES[0], 'blocked', 'blocked')
    expect(fetchOne).toHaveBeenCalledTimes(1)
    expect(d.onDone).not.toHaveBeenCalled()
  })

  it('treats a thrown error as a network failure and continues / 例外視為網路錯誤並繼續', async () => {
    const fetchOne = vi.fn(async () => {
      throw new Error('socket hang up')
    })
    const d = deps({ fetchOne })
    await runSerpQueue(d)
    expect(d.onError).toHaveBeenCalledTimes(2)
    expect(d.onDone).toHaveBeenCalledTimes(1)
  })

  it('parks while paused / 暫停時停駐', async () => {
    let paused = true
    const sleep = vi.fn(async () => {
      paused = false
    })
    const d = deps({ fetchOne: async (entry) => ok(entry.query), shouldPause: () => paused, sleep })
    await runSerpQueue(d)
    expect(sleep).toHaveBeenCalled()
    expect(d.onResult).toHaveBeenCalledTimes(2)
  })

  it('does nothing once aborted / 已中止則不執行', async () => {
    const controller = new AbortController()
    controller.abort()
    const fetchOne = vi.fn(async (entry: SerpQuery) => ok(entry.query))
    const d = deps({ fetchOne, signal: controller.signal })
    await runSerpQueue(d)
    expect(fetchOne).not.toHaveBeenCalled()
    expect(d.onDone).not.toHaveBeenCalled()
  })
})