/**
 * Dashboard header: product name, phase badge, language switcher, theme toggle.
 *
 * 儀表板頁首：產品名稱、狀態徽章、語言切換與主題切換。
 */
'use client'

import { Languages, Moon, Sun } from 'lucide-react'

import { useI18n } from '@/components/providers/LocaleProvider'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useTheme } from '@/hooks/useTheme'
import { LOCALE_LABEL, LOCALES, isLocale } from '@/lib/i18n'
import { cn } from '@/lib/utils'
import type { Phase } from '@/types/crawl'

/** Badge styling per phase. */
const PHASE_STYLE: Record<Phase, string> = {
  idle: 'bg-slate-500/15 text-slate-700 dark:text-slate-300',
  running: 'bg-emerald-500/20 text-emerald-700 dark:text-emerald-300',
  paused: 'bg-amber-500/20 text-amber-700 dark:text-amber-300',
  stopped: 'bg-slate-500/15 text-slate-700 dark:text-slate-300',
  done: 'bg-sky-500/20 text-sky-700 dark:text-sky-300',
}

interface DashboardHeaderProps {
  /** Phase of the current task. */
  phase: Phase
  /** Start URL of the current task, when one exists. */
  startUrl: string | null
}

/** Top bar of the dashboard. */
export function DashboardHeader({ phase, startUrl }: DashboardHeaderProps) {
  const { t, locale, setLocale } = useI18n()
  const { isDark, toggleTheme } = useTheme()

  return (
    <header className="flex flex-wrap items-center justify-between gap-3">
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <h1 className="text-xl font-semibold tracking-tight">Sitemap Builder</h1>
          <span
            className={cn(
              'inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium',
              PHASE_STYLE[phase],
            )}
          >
            <span
              className={cn('size-1.5 rounded-full bg-current', phase === 'running' && 'animate-pulse')}
            />
            {t(`phase.${phase}`)}
          </span>
        </div>
        <p className="text-xs text-muted-foreground">{t('app.subtitle')}</p>
      </div>

      <div className="flex min-w-0 items-center gap-2">
        {startUrl ? (
          <p
            className="hidden max-w-[26rem] truncate font-mono text-[11px] text-muted-foreground md:block"
            title={startUrl}
          >
            {startUrl}
          </p>
        ) : null}

        <div className="flex items-center gap-1">
          <Languages className="size-3.5 text-muted-foreground" aria-hidden />
          <Select
            name="locale"
            value={locale}
            onValueChange={(value) => {
              if (isLocale(value)) setLocale(value)
            }}
          >
            <SelectTrigger size="sm" className="h-8 w-28 text-xs" aria-label={t('header.language')}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {LOCALES.map((item) => (
                <SelectItem key={item} value={item} className="text-xs">
                  {LOCALE_LABEL[item]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <Button
          variant="ghost"
          size="icon"
          onClick={toggleTheme}
          title={isDark ? t('header.theme.toLight') : t('header.theme.toDark')}
          aria-label={isDark ? t('header.theme.toLight') : t('header.theme.toDark')}
        >
          {isDark ? <Moon className="size-4" /> : <Sun className="size-4" />}
        </Button>
      </div>
    </header>
  )
}