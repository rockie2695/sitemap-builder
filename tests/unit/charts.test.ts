/**
 * Unit tests for `lib/charts.ts`.
 *
 * `lib/charts.ts` 的單元測試。
 */
import { describe, expect, it } from 'vitest'

import { formatAxisNumber, yAxisWidthFor } from '@/lib/charts'

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