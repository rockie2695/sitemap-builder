/**
 * "Current job" card: which page is being fetched, the pipeline stage and the
 * overall stacked progress bar.
 *
 * 「当前抓取」卡片：正在处理的页面、阶段进度与整体堆叠进度条。
 */
'use client'

import { CircleCheck, Loader2, PauseCircle, Radio, Timer } from 'lucide-react'

import { ProgressBar } from '@/components/dashboard/ProgressBar'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import type { DerivedStats } from '@/lib/stats'
import { cn } from '@/lib/utils'
import type { CrawlTaskMeta, Phase } from '@/types/crawl'

interface CurrentJobCardProps {
  /** Current task scope, or null before the first start. */
  task: CrawlTaskMeta | null
  /** Current phase. */
  phase: Phase
  /** URL currently being fetched. */
  currentUrl: string | null
  /** When the in-flight request started. */
  currentStartedAt: number | null
  /** Ticking clock used for the elapsed timer. */
  now: number
  /** Derived counters. */
  stats: DerivedStats
}

/** Pipeline stages, in order. */
const STEPS = [
  { key: 'queue', label: '排队' },
  { key: 'request', label: '请求页面' },
  { key: 'extract', label: '提取链接' },
  { key: 'done', label: '完成' },
] as const

/**
 * Infer the stage from the request lifecycle.
 *
 * @returns Index into {@link STEPS}.
 */
function resolveStep(phase: Phase, currentUrl: string | null, stats: DerivedStats): number {
  if (phase === 'idle') return 0
  if (phase === 'paused') return currentUrl ? 1 : 0
  if (phase === 'done' || phase === 'stopped') return 4
  if (currentUrl) return stats.crawling > 0 ? 2 : 1
  return 1
}

/** Current-job card with the stage stepper and progress bar. */
export function CurrentJobCard({
  task,
  phase,
  currentUrl,
  currentStartedAt,
  now,
  stats,
}: CurrentJobCardProps) {
  const handled = stats.processed + stats.pending + stats.crawling
  const currentElapsed = currentStartedAt === null ? 0 : Math.max(0, now - currentStartedAt)
  const activeStep = resolveStep(phase, currentUrl, stats)

  return (
    <Card>
      <CardHeader className="flex-row flex-wrap items-center justify-between gap-3 pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          {phase === 'running' ? (
            <Radio className="size-4 animate-pulse text-emerald-600 dark:text-emerald-400" />
          ) : (
            <PauseCircle className="size-4 text-muted-foreground" />
          )}
          当前抓取
        </CardTitle>

        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline" className="font-mono text-[11px]">
            origin={task?.origin ?? '—'}
          </Badge>
          <Badge variant="outline" className="font-mono text-[11px]">
            前缀={task ? task.pathPrefix || '/' : '—'}
          </Badge>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Page currently in flight */}
        <div className="rounded-lg border bg-muted/40 px-3 py-2.5">
          <div className="flex items-center gap-2">
            <Loader2
              className={cn(
                'size-3.5 shrink-0 text-muted-foreground',
                phase === 'running' && currentUrl && 'animate-spin',
              )}
            />
            <p
              className="min-w-0 flex-1 truncate font-mono text-sm"
              title={currentUrl ?? undefined}
            >
              {currentUrl ?? (phase === 'idle' ? '等待输入起始 URL' : '空闲中（队列已处理完毕）')}
            </p>
            {currentUrl ? (
              <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                <Timer className="mr-1 inline size-3" />
                {(currentElapsed / 1000).toFixed(1)}s
              </span>
            ) : null}
          </div>

          {/* Stage stepper */}
          <ol className="mt-2.5 flex flex-wrap items-center gap-1.5 text-[11px]">
            {STEPS.map((step, index) => {
              const reached = index <= activeStep && phase !== 'idle'
              return (
                <li key={step.key} className="flex items-center gap-1.5">
                  <span
                    className={cn(
                      'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 transition-colors',
                      reached
                        ? 'border-emerald-600/40 bg-emerald-600/10 text-emerald-700 dark:text-emerald-300'
                        : 'text-muted-foreground',
                    )}
                  >
                    {index === 3 && reached ? <CircleCheck className="size-3" /> : null}
                    {step.label}
                  </span>
                  {index < STEPS.length - 1 ? (
                    <span className="text-muted-foreground/60">→</span>
                  ) : null}
                </li>
              )
            })}
          </ol>
        </div>

        {/* Overall progress */}
        <div className="space-y-1.5">
          <div className="flex items-baseline justify-between text-sm">
            <span className="text-muted-foreground">处理进度</span>
            <span className="font-medium tabular-nums">
              {stats.progressPct}%
              <span className="ml-2 text-xs font-normal text-muted-foreground">
                已处理 {stats.processed.toLocaleString()} / {handled.toLocaleString()}
              </span>
            </span>
          </div>
          <ProgressBar
            total={handled}
            segments={[
              {
                key: 'done',
                label: '已完成',
                value: stats.done,
                className: 'bg-emerald-500',
                dotClassName: 'bg-emerald-500',
              },
              {
                key: 'failed',
                label: '失败',
                value: stats.failed,
                className: 'bg-destructive',
                dotClassName: 'bg-destructive',
              },
              {
                key: 'crawling',
                label: '抓取中',
                value: stats.crawling,
                className: 'bg-amber-500',
                dotClassName: 'bg-amber-500',
              },
              {
                key: 'pending',
                label: '待处理',
                value: stats.pending,
                className: 'bg-slate-400 dark:bg-slate-600',
                dotClassName: 'bg-slate-400 dark:bg-slate-600',
              },
            ]}
          />
        </div>
      </CardContent>
    </Card>
  )
}