/**
 * Stacked progress bar.
 *
 * Segments are proportional to `total`, which the caller defines as
 * "processed + pending + crawling", so the bar never exceeds 100%.
 *
 * 堆疊式進度條。各區塊依 `total` 等比分配，`total` 由呼叫端定義為
 * 「已處理 + 待處理 + 抓取中」，因此不會超過 100%。
 */
'use client'

import { cn } from '@/lib/utils'

/** One coloured slice of the bar. */
export interface ProgressSegment {
  key: string
  label: string
  value: number
  /** Tailwind background class for the slice. */
  className: string
  /** Tailwind background class for the legend dot. */
  dotClassName: string
}

interface ProgressBarProps {
  segments: ProgressSegment[]
  /** Denominator for all segments combined. */
  total: number
  className?: string
  /** Render the legend row underneath the bar. */
  showLegend?: boolean
}

/** Stacked bar plus an optional legend. */
export function ProgressBar({ segments, total, className, showLegend = true }: ProgressBarProps) {
  // Guard against a zero denominator while the task is still idle.
  const denominator = Math.max(total, 1)
  const visible = segments.filter((segment) => segment.value > 0)

  return (
    <div className={cn('w-full', className)}>
      <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-muted">
        {visible.map((segment) => (
          <div
            key={segment.key}
            className={cn('h-full transition-[width] duration-500 ease-out', segment.className)}
            style={{ width: `${(segment.value / denominator) * 100}%` }}
            title={`${segment.label} ${segment.value}`}
          />
        ))}
      </div>

      {showLegend ? (
        <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
          {segments.map((segment) => (
            <span key={segment.key} className="inline-flex items-center gap-1.5">
              <span className={cn('size-2 shrink-0 rounded-full', segment.dotClassName)} />
              {segment.label}
              <span className="font-medium tabular-nums text-foreground">
                {segment.value.toLocaleString()}
              </span>
            </span>
          ))}
        </div>
      ) : null}
    </div>
  )
}