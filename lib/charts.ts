/**
 * Chart presentation helpers.
 *
 * 圖表呈現輔助函式。
 */

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