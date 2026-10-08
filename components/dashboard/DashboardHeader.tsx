/**
 * Dashboard header: product name, current start URL, phase badge, theme toggle.
 *
 * 儀表板頁首：產品名稱、目前起始網址、狀態徽章與主題切換。
 */
'use client'

import { Moon, Sun } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { useTheme } from '@/hooks/useTheme'
import { cn } from '@/lib/utils'
import type { Phase } from '@/types/crawl'

/** Badge styling per phase. */
const PHASE_BADGE: Record<Phase, { label: string; className: string }> = {
  idle: { label: '待命', className: 'bg-slate-500/15 text-slate-700 dark:text-slate-300' },
  running: { label: '运行中', className: 'bg-emerald-500/20 text-emerald-700 dark:text-emerald-300' },
  paused: { label: '已暂停', className: 'bg-amber-500/20 text-amber-700 dark:text-amber-300' },
  stopped: { label: '已停止', className: 'bg-slate-500/15 text-slate-700 dark:text-slate-300' },
  done: { label: '已完成', className: 'bg-sky-500/20 text-sky-700 dark:text-sky-300' },
}

interface DashboardHeaderProps {
  /** Phase of the current task. */
  phase: Phase
  /** Start URL of the current task, when one exists. */
  startUrl: string | null
}

/** Top bar of the dashboard. */
export function DashboardHeader({ phase, startUrl }: DashboardHeaderProps) {
  const { isDark, toggleTheme } = useTheme()
  const badge = PHASE_BADGE[phase]

  return (
    <header className="flex flex-wrap items-center justify-between gap-3">
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <h1 className="text-xl font-semibold tracking-tight">Sitemap Builder</h1>
          <span
            className={cn(
              'inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium',
              badge.className,
            )}
          >
            <span className={cn('size-1.5 rounded-full bg-current', phase === 'running' && 'animate-pulse')} />
            {badge.label}
          </span>
        </div>
        <p className="text-xs text-muted-foreground">
          解析起始 URL → 无头浏览器逐页抓取 → 导出 sitemap.xml
        </p>
      </div>

      <div className="flex min-w-0 items-center gap-2">
        {startUrl ? (
          <p
            className="hidden max-w-[28rem] truncate font-mono text-[11px] text-muted-foreground md:block"
            title={startUrl}
          >
            {startUrl}
          </p>
        ) : null}

        <Button
          variant="ghost"
          size="icon"
          onClick={toggleTheme}
          title={isDark ? '切换到浅色模式' : '切换到深色模式'}
          aria-label={isDark ? '切换到浅色模式' : '切换到深色模式'}
        >
          {isDark ? <Moon className="size-4" /> : <Sun className="size-4" />}
        </Button>
      </div>
    </header>
  )
}