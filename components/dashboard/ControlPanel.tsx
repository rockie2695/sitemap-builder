/**
 * Input row + task controls + crawl options.
 *
 * Every button here lives inside a `<form>` (so Enter submits the URL), which means
 * non-submit buttons MUST declare `type="button"` — otherwise they submit the form
 * and silently restart the task.
 *
 * 輸入列、任務控制與抓取選項。
 * 這裡的按鈕都位於 `<form>` 內（讓 Enter 可直接送出網址），
 * 因此非送出按鈕「必須」宣告 `type="button"`，否則會提交表單並悄悄重啟整個任務。
 */
'use client'

import type { FormEvent } from 'react'
import { Pause, Play, Square, Trash2 } from 'lucide-react'

import { useI18n } from '@/components/providers/LocaleProvider'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { MAX_CONCURRENCY, MAX_RETRIES } from '@/hooks/crawler/constants'
import { cn } from '@/lib/utils'
import type { CrawlOptions, Phase } from '@/types/crawl'

interface ControlPanelProps {
  /** Current start-URL field value. */
  inputUrl: string
  /** Field change handler. */
  onInputUrlChange: (value: string) => void
  /** Validate and start a new task. */
  onStart: () => void
  /** Park the loop between pages. */
  onPause: () => void
  /** Resume a paused (or restored) task. */
  onResume: () => void
  /** Abort immediately and drop the queue. */
  onStop: () => void
  /** Clear everything, including the stored snapshot. */
  onReset: () => void
  /** Current phase; drives which buttons are enabled. */
  phase: Phase
  /** Shared crawl options. */
  options: CrawlOptions
  /** Merge option patches back into the crawl options. */
  onOptionsChange: (patch: Partial<CrawlOptions>) => void
}

/** Phase pill styling. */
const PHASE_PILL: Record<Phase, string> = {
  idle: 'bg-slate-500/15 text-slate-700 dark:text-slate-300',
  running: 'bg-emerald-500/20 text-emerald-700 dark:text-emerald-300',
  paused: 'bg-amber-500/20 text-amber-700 dark:text-amber-300',
  stopped: 'bg-slate-500/15 text-slate-700 dark:text-slate-300',
  done: 'bg-sky-500/20 text-sky-700 dark:text-sky-300',
}

/** Start-URL field plus start / pause / stop / clear and the crawl options. */
export function ControlPanel({
  inputUrl,
  onInputUrlChange,
  onStart,
  onPause,
  onResume,
  onStop,
  onReset,
  phase,
  options,
  onOptionsChange,
}: ControlPanelProps) {
  const { t } = useI18n()
  const running = phase === 'running'
  const paused = phase === 'paused'

  const submit = (event: FormEvent) => {
    event.preventDefault()
    onStart()
  }

  /** Clamp a numeric option into an inclusive range, defaulting on garbage input. */
  const clampNumber = (raw: string, min: number, max: number, fallback: number): number =>
    Math.max(min, Math.min(max, Number(raw) || fallback))

  return (
    <Card>
      <CardContent className="space-y-4">
        <form onSubmit={submit} className="flex flex-col gap-3 lg:flex-row lg:items-center">
          <div className="flex-1">
            <Label htmlFor="start-url" className="mb-1.5 block text-xs text-muted-foreground">
              {t('control.startUrl')}
            </Label>
            <Input
              id="start-url"
              name="start-url"
              value={inputUrl}
              onChange={(event) => onInputUrlChange(event.target.value)}
              placeholder="https://www.example.com/test"
              className="font-mono"
              autoComplete="off"
              spellCheck={false}
              disabled={running}
            />
          </div>

          <div className="flex flex-wrap items-center gap-2 lg:pt-[22px]">
            <Button type="submit" disabled={running || paused} className="min-w-24">
              <Play className="size-4" />
              {t('control.start')}
            </Button>

            {running ? (
              <Button type="button" variant="outline" onClick={onPause} className="min-w-24">
                <Pause className="size-4" />
                {t('control.pause')}
              </Button>
            ) : (
              <Button
                type="button"
                variant="outline"
                onClick={onResume}
                disabled={!paused}
                className="min-w-24"
              >
                <Play className="size-4" />
                {t('control.resume')}
              </Button>
            )}

            <Button
              type="button"
              variant="destructive"
              onClick={onStop}
              disabled={!running && !paused}
              className="min-w-24"
            >
              <Square className="size-4" />
              {t('control.stop')}
            </Button>

            <Button type="button" variant="ghost" onClick={onReset} title={t('control.clearTitle')}>
              <Trash2 className="size-4" />
              {t('control.clear')}
            </Button>
          </div>
        </form>

        {/* Crawl options */}
        <div className="flex flex-wrap items-end gap-x-6 gap-y-3 border-t pt-3 text-xs">
          <span
            className={cn(
              'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 font-medium',
              PHASE_PILL[phase],
            )}
          >
            <span className={cn('size-1.5 rounded-full bg-current', running && 'animate-pulse')} />
            {t(`phase.${phase}`)}
          </span>

          <label className="flex items-center gap-2">
            <Switch
              checked={!options.stripQuery}
              onCheckedChange={(checked) => onOptionsChange({ stripQuery: !checked })}
            />
            <span className="text-muted-foreground">
              {t('control.keepQuery')}
              <span className="ml-1 text-[11px] text-muted-foreground/80">
                {options.stripQuery ? t('control.query.stripped') : t('control.query.kept')}
              </span>
            </span>
          </label>

          <label className="flex items-center gap-2">
            <span className="text-muted-foreground">{t('control.maxPages')}</span>
            <Input
              name="maxPages"
              type="number"
              min={1}
              max={100_000}
              value={options.maxPages}
              onChange={(event) =>
                onOptionsChange({ maxPages: clampNumber(event.target.value, 1, 100_000, 1) })
              }
              className="h-8 w-24 text-xs tabular-nums"
            />
          </label>

          <label className="flex items-center gap-2">
            <span className="text-muted-foreground">{t('control.delay')}</span>
            <Input
              name="delayMs"
              type="number"
              min={0}
              max={60_000}
              step={100}
              value={options.delayMs}
              onChange={(event) =>
                onOptionsChange({ delayMs: clampNumber(event.target.value, 0, 60_000, 0) })
              }
              className="h-8 w-24 text-xs tabular-nums"
            />
            <span className="text-muted-foreground">{t('control.delayUnit')}</span>
          </label>

          <label className="flex items-center gap-2" title={t('control.concurrencyTitle')}>
            <span className="text-muted-foreground">{t('control.concurrency')}</span>
            <Input
              name="concurrency"
              type="number"
              min={1}
              max={MAX_CONCURRENCY}
              value={options.concurrency}
              onChange={(event) =>
                onOptionsChange({
                  concurrency: clampNumber(event.target.value, 1, MAX_CONCURRENCY, 1),
                })
              }
              className="h-8 w-16 text-xs tabular-nums"
            />
          </label>

          <label className="flex items-center gap-2" title={t('control.retryTitle')}>
            <span className="text-muted-foreground">{t('control.retryCount')}</span>
            <Input
              name="retryCount"
              type="number"
              min={0}
              max={MAX_RETRIES}
              value={options.retryCount}
              onChange={(event) =>
                onOptionsChange({
                  retryCount: clampNumber(event.target.value, 0, MAX_RETRIES, 0),
                })
              }
              className="h-8 w-16 text-xs tabular-nums"
            />
            <span className="text-muted-foreground">{t('control.times')}</span>
          </label>
        </div>
      </CardContent>
    </Card>
  )
}