/**
 * Unit tests for `lib/stats.ts`: derived counters, throughput and formatting.
 *
 * `lib/stats.ts` 的單元測試：衍生統計、吞吐量與格式化。
 */
import { describe, expect, it } from 'vitest'

import { computeStats, formatClock, formatDuration } from '@/lib/stats'
import type { CrawlRuntimeStats, UrlRecord } from '@/types/crawl'

const NOW = Date.parse('2026-10-07T08:00:00Z')

/** Runtime counters preset for tests. */
function runtime(extra: Partial<CrawlRuntimeStats> = {}): CrawlRuntimeStats {
  return {
    startedAt: NOW - 60_000,
    finishedAt: null,
    requests: 0,
    consecutiveErrors: 0,
    skippedLinks: 0,
    ...extra,
  }
}

/** Archive record preset for tests. */
function record(status: UrlRecord['status'], extra: Partial<UrlRecord> = {}): UrlRecord {
  return {
    url: `https://example.com/${Math.random()}`,
    status,
    depth: 0,
    httpStatus: 200,
    pageTitle: null,
    finalUrl: null,
    lastModified: null,
    redirected: false,
    foundLinks: 0,
    queuedAt: NOW - 60_000,
    startedAt: NOW - 60_000,
    finishedAt: NOW - 59_000,
    durationMs: 1000,
    ...extra,
  }
}

/** Build an archive map from statuses. */
function archive(...statuses: UrlRecord['status'][]): Map<string, UrlRecord> {
  return new Map(statuses.map((status, index) => [`url-${index}`, record(status, { url: `https://example.com/${index}` })]))
}

describe('computeStats / 衍生統計', () => {
  it('returns zeros for an empty archive / 空結果全為零', () => {
    const stats = computeStats(new Map(), runtime({ startedAt: null }), NOW, 0, [])
    expect(stats.addedToSitemap).toBe(0)
    expect(stats.pending).toBe(0)
    expect(stats.crawling).toBe(0)
    expect(stats.done).toBe(0)
    expect(stats.failed).toBe(0)
    expect(stats.progressPct).toBe(0)
    expect(stats.elapsedMs).toBe(0)
  })

  it('counts every status / 統計各種狀態', () => {
    const stats = computeStats(
      archive('done', 'done', 'failed', 'crawling', 'queued'),
      runtime(),
      NOW,
      0,
      [],
    )
    expect(stats.addedToSitemap).toBe(5)
    expect(stats.done).toBe(2)
    expect(stats.failed).toBe(1)
    expect(stats.crawling).toBe(1)
    expect(stats.pending).toBe(0)
    expect(stats.processed).toBe(3)
    // Denominator includes the in-flight page: 3 / (3 + 1).
    expect(stats.progressPct).toBe(75)
    expect(stats.successRate).toBe(66.7)
  })

  it('counts the engine queue as pending / 引擎佇列計入待處理', () => {
    const stats = computeStats(archive('done'), runtime(), NOW, 4, [])
    expect(stats.pending).toBe(4)
    expect(stats.progressPct).toBe(20) // 1 done / (1 done + 4 pending)
  })

  it('carries the skipped-link counter / 帶入跳過連結數', () => {
    const stats = computeStats(archive(), runtime({ skippedLinks: 12 }), NOW, 0, [])
    expect(stats.skipped).toBe(12)
  })

  it('computes the average page duration / 計算平均每頁耗時', () => {
    const records = new Map([
      ['a', record('done', { durationMs: 1000, url: 'https://example.com/a' })],
      ['b', record('done', { durationMs: 3000, url: 'https://example.com/b' })],
      ['c', record('failed', { durationMs: 9000, url: 'https://example.com/c' })],
    ])
    const stats = computeStats(records, runtime(), NOW, 0, [])
    expect(stats.avgMs).toBe(2000) // only done pages count
  })

  it('stops the elapsed clock at finishedAt / 已結束的任務以完成時間為準', () => {
    const stats = computeStats(archive('done'), runtime({ finishedAt: NOW - 10_000 }), NOW, 0, [])
    expect(stats.elapsedMs).toBe(50_000)
  })

  it('derives throughput from recent samples / 從最近取樣推導吞吐量', () => {
    const history = [
      { t: NOW - 30_000, done: 0, failed: 0, pending: 10 },
      { t: NOW - 15_000, done: 5, failed: 0, pending: 5 },
      { t: NOW - 5_000, done: 10, failed: 0, pending: 0 },
    ]
    const stats = computeStats(archive('done'), runtime(), NOW, 0, history)
    // 10 pages in 25 seconds = 24 pages/minute.
    expect(stats.perMinute).toBe(24)
  })

  it('falls back to the overall average when samples are missing / 無取樣時回退整體平均', () => {
    const stats = computeStats(
      archive('done', 'done'),
      runtime({ startedAt: NOW - 60_000 }),
      NOW,
      0,
      [],
    )
    expect(stats.perMinute).toBe(2) // 2 pages in 60s
  })

  it('estimates the remaining time from the throughput / 依吞吐量估算剩餘時間', () => {
    const history = [
      { t: NOW - 30_000, done: 0, failed: 0, pending: 20 },
      { t: NOW - 5_000, done: 10, failed: 0, pending: 10 },
    ]
    const records = archive(
      ...(Array.from({ length: 10 }, () => 'done') as UrlRecord['status'][]),
    )
    // 10 pages in 25s → 24 pages/min; 12 remaining → 30s.
    const stats = computeStats(records, runtime(), NOW, 12, history)
    expect(stats.etaMs).toBe(30_000)
  })

  it('reports no ETA while throughput is unknown / 吞吐量未知時不估算', () => {
    const stats = computeStats(archive('queued', 'queued'), runtime({ startedAt: null }), 0, 2, [])
    expect(stats.etaMs).toBeNull()
  })
})

describe('formatDuration / 耗時格式化', () => {
  it('formats milliseconds, seconds, minutes and hours / 各種時間量級', () => {
    expect(formatDuration(0)).toBe('—')
    expect(formatDuration(400)).toBe('400ms')
    expect(formatDuration(1200)).toBe('1.2s')
    expect(formatDuration(192_000)).toBe('3m 12s')
    expect(formatDuration(5_400_000)).toBe('1h 30m')
  })
})

describe('formatClock / 時間戳格式化', () => {
  it('pads to HH:MM:SS / 補零至 HH:MM:SS', () => {
    expect(formatClock(new Date(2026, 0, 1, 9, 5, 3).getTime())).toBe('09:05:03')
  })
})