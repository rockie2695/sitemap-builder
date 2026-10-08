/**
 * Statistic cards derived from the crawl archive.
 *
 * Numbers come from `lib/stats.ts`; this component only maps them onto cards and
 * animates the count-up so live progress feels responsive.
 *
 * 統計卡片。數字由 `lib/stats.ts` 推導，這裡只負責排版並加上數字滾動動畫，
 * 讓即時進度更有回饋感。
 */
'use client'

import type { LucideIcon } from 'lucide-react'
import {
  CircleCheck,
  CircleSlash,
  Clock3,
  FileCode2,
  Gauge,
  Loader2,
  Timer,
  XCircle,
} from 'lucide-react'

import { AnimatedNumber } from '@/components/dashboard/AnimatedNumber'
import { Card, CardContent } from '@/components/ui/card'
import type { DerivedStats } from '@/lib/stats'
import { cn } from '@/lib/utils'

/** One card definition. */
interface StatDefinition {
  key: string
  label: string
  icon: LucideIcon
  hint: string
  /** Optional accent colour for the value. */
  tone?: string
  /** Rendered after the number, e.g. a unit. */
  suffix?: string
}

const DEFINITIONS: StatDefinition[] = [
  { key: 'addedToSitemap', label: '已加入 Sitemap', icon: FileCode2, hint: '已发现的页面总数' },
  { key: 'pending', label: '待处理', icon: Clock3, hint: '队列中等待抓取的页面' },
  { key: 'crawling', label: '抓取中', icon: Loader2, hint: '正在打开的页面' },
  {
    key: 'done',
    label: '已完成',
    icon: CircleCheck,
    hint: '成功抓取并提取链接的页面',
    tone: 'text-emerald-600 dark:text-emerald-400',
  },
  { key: 'failed', label: '失败', icon: XCircle, hint: '打开失败的页面', tone: 'text-destructive' },
  { key: 'skipped', label: '已跳过', icon: CircleSlash, hint: '非 HTML 文档（pdf / 图片等）' },
  { key: 'successRate', label: '成功率', icon: Gauge, hint: '完成 /（完成 + 失败）', suffix: '%' },
  { key: 'perMinute', label: '吞吐量', icon: Gauge, hint: '最近一分钟完成页数', suffix: '页/分' },
  { key: 'elapsedMs', label: '已用时', icon: Timer, hint: '任务总耗时' },
  { key: 'avgMs', label: '平均每页', icon: Timer, hint: '成功页面的平均耗时' },
]

interface StatsCardsProps {
  /** Derived counters for the current task. */
  stats: DerivedStats
  /** Formats millisecond durations as `1.2s` / `3m 12s`. */
  formatDuration: (ms: number) => string
}

/** Grid of ten statistic cards. */
export function StatsCards({ stats, formatDuration }: StatsCardsProps) {
  /** Raw numeric value per card; duration cards use 0 and render text instead. */
  const numeric: Record<string, number> = {
    addedToSitemap: stats.addedToSitemap,
    pending: stats.pending,
    crawling: stats.crawling,
    done: stats.done,
    failed: stats.failed,
    skipped: stats.skipped,
    successRate: stats.successRate,
    perMinute: stats.perMinute,
    elapsedMs: 0,
    avgMs: 0,
  }

  /** Textual value for the two duration cards. */
  const durationText: Record<string, string> = {
    elapsedMs: formatDuration(stats.elapsedMs),
    avgMs: stats.avgMs > 0 ? formatDuration(stats.avgMs) : '—',
  }

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5" data-testid="stats-grid">
      {DEFINITIONS.map((definition) => {
        const Icon = definition.icon
        const isDuration = definition.key in durationText

        return (
          <Card key={definition.key} className="gap-0 py-3" title={definition.hint}>
            <CardContent className="flex items-start justify-between gap-2 px-3">
              <div className="min-w-0">
                <p className="truncate text-xs text-muted-foreground">{definition.label}</p>
                <p
                  className={cn(
                    'mt-1 flex items-baseline text-xl font-semibold tabular-nums tracking-tight',
                    definition.tone,
                  )}
                >
                  {isDuration ? (
                    durationText[definition.key]
                  ) : (
                    <>
                      <AnimatedNumber value={numeric[definition.key]} />
                      {definition.suffix ? (
                        <span className="ml-0.5 text-xs font-normal text-muted-foreground">
                          {definition.suffix}
                        </span>
                      ) : null}
                    </>
                  )}
                </p>
              </div>
              <Icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
            </CardContent>
          </Card>
        )
      })}
    </div>
  )
}