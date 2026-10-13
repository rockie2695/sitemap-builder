/**
 * Unit tests for `lib/charts.ts`.
 *
 * `lib/charts.ts` 的單元測試。
 */
import { describe, expect, it } from 'vitest'

import { downsamplePoints, formatAxisNumber, selectTrendSamples, yAxisWidthFor } from '@/lib/charts'
import type { HistoryPoint } from '@/types/crawl'

/** A history sample. */
function point(t: number, done = 0, pending = 0): HistoryPoint {
  return { t, done, failed: 0, pending }
}

describe('selectTrendSamples / 選取樣本', () => {
  // 120 samples, one per second: t = 0s … 119s.
  const history = Array.from({ length: 120 }, (_, i) => point(i * 1_000, i, 120 - i))

  it('full keeps the whole run / 全程保留整段', () => {
    expect(selectTrendSamples(history, 'full')).toHaveLength(120)
  })

  it('current is a real time window, not a sample count / 當前時段是時間窗而非筆數', () => {
    const windowed = selectTrendSamples(history, 'current')
    // The last sample is at 119s, so the window starts at 119s − 60s = 59s.
    expect(windowed[0].t).toBe(59_000)
    expect(windowed[windowed.length - 1].t).toBe(119_000)
    expect(windowed.length).toBe(61)
  })

  it('falls back to the last two points for a very short run / 極短執行退回最後兩點', () => {
    expect(selectTrendSamples([point(0, 0, 1), point(1_000, 1, 0)], 'current')).toHaveLength(2)
  })

  it('handles an empty history / 空歷史', () => {
    expect(selectTrendSamples([], 'current')).toEqual([])
    expect(selectTrendSamples([], 'full')).toEqual([])
  })
})

describe('downsamplePoints / 降採樣', () => {
  const points = Array.from({ length: 1_000 }, (_, i) => point(i, i, 0))

  it('caps the count and keeps the last point exact / 限制筆數並保留最後一點', () => {
    const out = downsamplePoints(points, 240)
    expect(out).toHaveLength(240)
    expect(out[out.length - 1]).toBe(points[points.length - 1])
    expect(out[0]).toBe(points[0])
  })

  it('returns a copy when already small / 本來就少時回傳副本', () => {
    const small = [point(0), point(1)]
    const out = downsamplePoints(small, 240)
    expect(out).toEqual(small)
    expect(out).not.toBe(small)
  })
})

describe('yAxisWidthFor / Y 軸寬度', () => {
  it('grows with the magnitude / 隨數量級增長', () => {
    expect(yAxisWidthFor(0)).toBe(40)
    expect(yAxisWidthFor(8)).toBe(40)
    expect(yAxisWidthFor(99)).toBe(40)
    expect(yAxisWidthFor(100)).toBe(48)
    expect(yAxisWidthFor(999)).toBe(48)
    expect(yAxisWidthFor(1_000)).toBe(60)
    expect(yAxisWidthFor(9_999)).toBe(60)
    expect(yAxisWidthFor(10_000)).toBe(72)
    expect(yAxisWidthFor(100_000)).toBe(84)
    expect(yAxisWidthFor(1_000_000)).toBe(96)
  })

  it('is monotonic / 單調不減', () => {
    const samples = [0, 50, 500, 5_000, 50_000, 500_000, 5_000_000]
    const widths = samples.map(yAxisWidthFor)
    for (let i = 1; i < widths.length; i += 1) {
      expect(widths[i]).toBeGreaterThanOrEqual(widths[i - 1])
    }
  })

  it('handles negatives and NaN / 處理負數與 NaN', () => {
    expect(yAxisWidthFor(-5_000)).toBe(60)
    expect(yAxisWidthFor(Number.NaN)).toBe(40)
  })
})

describe('formatAxisNumber / 軸標籤格式', () => {
  it('groups thousands / 千分位分組', () => {
    expect(formatAxisNumber(0)).toBe('0')
    expect(formatAxisNumber(999)).toBe('999')
    expect(formatAxisNumber(1_000)).toBe('1,000')
    expect(formatAxisNumber(12_345)).toBe('12,345')
  })
})