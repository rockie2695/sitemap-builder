/**
 * Chart presentation helpers.
 *
 * 圖表呈現輔助函式。
 */
import type { HistoryPoint } from '@/types/crawl'

/** How much of the history the trend chart shows. */
export type ChartPeriod = 'current' | 'full'

/** Length of the "current" window in milliseconds. */
export const CURRENT_WINDOW_MS = 60_000

/** Highest number of points plotted (long runs are downsampled to stay readable). */
export const MAX_TREND_POINTS = 240

/**
 * Downsample points to at most `maxPoints`, keeping the last (current) point exact.
 *
 * Sampling by even stride preserves the shape while bounding the SVG size for a long
 * crawl; the last sample is always kept so the chart ends on the live value.
 *
 * 將點降採樣至最多 `maxPoints`，並保留最後（當前）點。以等距取樣保留形狀，
 * 同時限制長時間抓取的 SVG 大小；最後一點一定保留，讓圖表結束在即時值。
 *
 * @param points    Samples in time order.
 * @param maxPoints Upper bound (values < 2 disable downsampling).
 */
export function downsamplePoints(points: readonly HistoryPoint[], maxPoints: number): HistoryPoint[] {
  if (maxPoints < 2 || points.length <= maxPoints) return [...points]

  const stride = (points.length - 1) / (maxPoints - 1)
  const out: HistoryPoint[] = []
  for (let i = 0; i < maxPoints; i += 1) out.push(points[Math.round(i * stride)])
  out[out.length - 1] = points[points.length - 1]
  return out
}

/**
 * Pick the samples to plot for a period.
 *
 * `current` is a real **time** window (the last {@link CURRENT_WINDOW_MS} of samples), not
 * a fixed sample count — so a throttled/irregular sampler still means "the last minute".
 * `full` is the whole run since the task started.
 *
 * @param history  Samples in time order.
 * @param period   Which period to show.
 * @param windowMs Current-window length in ms.
 */
export function selectTrendSamples(
  history: readonly HistoryPoint[],
  period: ChartPeriod,
  windowMs: number = CURRENT_WINDOW_MS,
): HistoryPoint[] {
  if (period === 'full') return downsamplePoints(history, MAX_TREND_POINTS)

  const last = history[history.length - 1]
  if (!last) return []

  const cutoff = last.t - windowMs
  const windowed = history.filter((point) => point.t >= cutoff)
  // A very short run has fewer than two samples in the window; still draw a line.
  const chosen = windowed.length >= 2 ? windowed : history.slice(-2)
  return downsamplePoints(chosen, MAX_TREND_POINTS)
}

/**
 * Y-axis width that fits the largest tick label.
 *
 * Recharts needs an explicit width; a fixed 40px clips labels once the values reach
 * the hundreds or thousands.
 *
 * @param maxValue Largest value the axis will show.
 * @returns Width in pixels.
 *
 * @example
 * yAxisWidthFor(8)      // 40
 * yAxisWidthFor(12_000) // 72
 */
export function yAxisWidthFor(maxValue: number): number {
  const magnitude = Math.abs(maxValue)
  if (magnitude >= 1_000_000) return 96
  if (magnitude >= 100_000) return 84
  if (magnitude >= 10_000) return 72
  if (magnitude >= 1_000) return 60
  if (magnitude >= 100) return 48
  return 40
}

/**
 * Format an axis tick.
 *
 * Uses a stable `en-US` grouping (`1,000`) regardless of UI locale so axis labels
 * stay compact and comparable.
 *
 * @param value Tick value.
 */
export function formatAxisNumber(value: number): string {
  return value.toLocaleString('en-US')
}