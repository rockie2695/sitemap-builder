/**
 * "Current job" card: which page is being fetched, the pipeline stage, the ETA and
 * the overall stacked progress bar.
 *
 * 「當前抓取」卡片：正在處理的頁面、階段進度、預計剩餘時間與整體堆疊進度條。
 */
'use client'

import { CircleCheck, Loader2, PauseCircle, Radio, Timer } from 'lucide-react'

import { ProgressBar } from '@/components/dashboard/ProgressBar'
import { useI18n } from '@/components/providers/LocaleProvider'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { formatDuration, type DerivedStats } from '@/lib/stats'
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

/** Pipeline stages, in order (labels are i18n keys). */
const STEPS = ['job.stage.queue', 'job.stage.request', 'job.stage.extract', 'job.stage.done'] as const

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

/** Current-job card with the stage stepper, ETA and progress bar. */
export function CurrentJobCard({
  task,
  phase,
  currentUrl,
  currentStartedAt,
  now,
  stats,
}: CurrentJobCardProps) {
  const { t } = useI18n()
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
          {t('job.title')}
        </CardTitle>

        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline" className="font-mono text-[11px]">
            origin={task?.origin ?? '—'}
          </Badge>
          <Badge variant="outline" className="font-mono text-[11px]">
            prefix={task ? task.pathPrefix || '/' : '—'}
          </Badge>
          {stats.crawling > 1 ? (
            <Badge variant="secondary" className="text-[11px]">
              {t('job.concurrency', { count: stats.crawling })}
            </Badge>
          ) : null}
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
            <p className="min-w-0 flex-1 truncate font-mono text-sm" title={currentUrl ?? undefined}>
              {currentUrl ?? (phase === 'idle' ? t('job.waitingInput') : t('job.idle'))}
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
                <li key={step} className="flex items-center gap-1.5">
                  <span
                    className={cn(
                      'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 transition-colors',
                      reached
                        ? 'border-emerald-600/40 bg-emerald-600/10 text-emerald-700 dark:text-emerald-300'
                        : 'text-muted-foreground',
                    )}
                  >
                    {index === 3 && reached ? <CircleCheck className="size-3" /> : null}
                    {t(step)}
                  </span>
                  {index < STEPS.length - 1 ? (
                    <span className="text-muted-foreground/60">→</span>
                  ) : null}
                </li>
              )
            })}
          </ol>
        </div>

        {/* Overall progress + ETA */}
        <div className="space-y-1.5">
          <div className="flex flex-wrap items-baseline justify-between gap-2 text-sm">
            <span className="text-muted-foreground">{t('job.progress')}</span>
            <span className="font-medium tabular-nums">
              {stats.progressPct}%
              <span className="ml-2 text-xs font-normal text-muted-foreground">
                {t('job.processed')} {stats.processed.toLocaleString()} / {handled.toLocaleString()}
              </span>
              <span className="ml-2 text-xs font-normal text-muted-foreground">
                {t('job.eta', { duration: stats.etaMs === null ? '—' : formatDuration(stats.etaMs) })}
              </span>
            </span>
          </div>
          <ProgressBar
            total={handled}
            segments={[
              {
                key: 'done',
                label: t('legend.done'),
                value: stats.done,
                className: 'bg-emerald-500',
                dotClassName: 'bg-emerald-500',
              },
              {
                key: 'failed',
                label: t('legend.failed'),
                value: stats.failed,
                className: 'bg-destructive',
                dotClassName: 'bg-destructive',
              },
              {
                key: 'crawling',
                label: t('legend.crawling'),
                value: stats.crawling,
                className: 'bg-amber-500',
                dotClassName: 'bg-amber-500',
              },
              {
                key: 'pending',
                label: t('legend.pending'),
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