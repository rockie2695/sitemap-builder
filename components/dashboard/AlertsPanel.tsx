/**
 * Status / hint banners shown between the control panel and the stat cards.
 *
 * 位於控制面板與統計卡之間的狀態／提示列。
 */
'use client'

import { History, Info, RotateCcw, TriangleAlert } from 'lucide-react'

import { useI18n } from '@/components/providers/LocaleProvider'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'

interface AlertsPanelProps {
  /** Non-null when the start URL could not be parsed. */
  inputError: string | null
  /** Non-null when the resume snapshot could not be written. */
  persistError: string | null
  /** True when the visible state came from a snapshot. */
  restored: boolean
  /** URLs discovered so far (restore banner). */
  restoredCount: number
  /** URLs still queued (restore banner). */
  restoredPending: number
  /** True while no task has been started: shows the how-to-use hint. */
  showHint: boolean
  /** Continue the restored task. */
  onResume: () => void
  /** Throw the restored snapshot away. */
  onDiscard: () => void
}

/** All the contextual alerts of the dashboard. */
export function AlertsPanel({
  inputError,
  persistError,
  restored,
  restoredCount,
  restoredPending,
  showHint,
  onResume,
  onDiscard,
}: AlertsPanelProps) {
  const { t } = useI18n()

  return (
    <div className="flex flex-col gap-2">
      {inputError ? (
        <Alert variant="destructive">
          <TriangleAlert className="size-4" />
          <AlertTitle>{t('alert.cannotStart')}</AlertTitle>
          <AlertDescription className="block">{inputError}</AlertDescription>
        </Alert>
      ) : null}

      {persistError ? (
        <Alert variant="destructive">
          <TriangleAlert className="size-4" />
          <AlertTitle>{t('alert.persistFailed')}</AlertTitle>
          <AlertDescription className="block">{persistError}</AlertDescription>
        </Alert>
      ) : null}

      {restored ? (
        <Alert>
          <History className="size-4" />
          <AlertTitle>{t('alert.restored.title')}</AlertTitle>
          <AlertDescription className="block">
            <p className="leading-relaxed">
              {t('alert.restored.body', { count: restoredCount, pending: restoredPending })}
            </p>
            <span className="mt-2 flex gap-2">
              <Button size="sm" onClick={onResume}>
                <RotateCcw className="size-3.5" />
                {t('alert.resume')}
              </Button>
              <Button size="sm" variant="outline" onClick={onDiscard}>
                {t('alert.discard')}
              </Button>
            </span>
          </AlertDescription>
        </Alert>
      ) : null}

      {showHint ? (
        <Alert>
          <Info className="size-4" />
          <AlertTitle>{t('alert.hint.title')}</AlertTitle>
          <AlertDescription className="block">
            {/* AlertDescription is a flex container, so prose must live in one element. */}
            <p className="leading-relaxed">{t('alert.hint.p1')}</p>
            <p className="mt-1 text-xs text-muted-foreground/80">{t('alert.hint.p2')}</p>
          </AlertDescription>
        </Alert>
      ) : null}
    </div>
  )
}