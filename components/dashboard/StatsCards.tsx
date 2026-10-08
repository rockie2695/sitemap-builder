/**
 * Statistic cards derived from the crawl archive.
 *
 * Numbers come from `lib/stats.ts`; this component maps them onto cards and
 * animates the count-up so live progress feels responsive.
 *
 * 統計卡片。數字由 `lib/stats.ts` 推導，這裡只負責排版並加上數字滾動動畫。
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
import { useI18n } from '@/components/providers/LocaleProvider'
import { Card, CardContent } from '@/components/ui/card'
import type { UiKey } from '@/lib/i18n'
import type { DerivedStats } from '@/lib/stats'
import { cn } from '@/lib/utils'

/** One card definition; label and hint are i18n keys. */
interface StatDefinition {
  key: keyof DerivedStats
  label: UiKey
  hint: UiKey
  icon: LucideIcon
  tone?: string
  /** i18n key for the unit shown after the number. */
  suffix?: UiKey
}

const DEFINITIONS: StatDefinition[] = [
  { key: 'addedToSitemap', label: 'stats.addedToSitemap', hint: 'stats.hint.addedToSitemap', icon: FileCode2 },
  { key: 'pending', label: 'stats.pending', hint: 'stats.hint.pending', icon: Clock3 },
  { key: 'crawling', label: 'stats.crawling', hint: 'stats.hint.crawling', icon: Loader2 },
  {
    key: 'done',
    label: 'stats.done',
    hint: 'stats.hint.done',
    icon: CircleCheck,
    tone: 'text-emerald-600 dark:text-emerald-400',
  },
  {
    key: 'failed',
    label: 'stats.failed',
    hint: 'stats.hint.failed',
    icon: XCircle,
    tone: 'text-destructive',
  },
  { key: 'skipped', label: 'stats.skipped', hint: 'stats.hint.skipped', icon: CircleSlash },
  { key: 'successRate', label: 'stats.successRate', hint: 'stats.hint.successRate', icon: Gauge },
  {
    key: 'perMinute',
    label: 'stats.perMinute',
    hint: 'stats.hint.perMinute',
    icon: Gauge,
    suffix: 'stats.perMinuteUnit',
  },
  { key: 'elapsedMs', label: 'stats.elapsed', hint: 'stats.hint.elapsed', icon: Timer },
  { key: 'avgMs', label: 'stats.avgPerPage', hint: 'stats.hint.avgPerPage', icon: Timer },
]

/** Stats rendered as pre-formatted text rather than an animated number. */
const DURATION_KEYS = new Set<keyof DerivedStats>(['elapsedMs', 'avgMs'])

interface StatsCardsProps {
  /** Derived counters for the current task. */
  stats: DerivedStats
  /** Formats millisecond durations as `1.2s` / `3m 12s`. */
  formatDuration: (ms: number) => string
}

/** Grid of ten statistic cards. */
export function StatsCards({ stats, formatDuration }: StatsCardsProps) {
  const { t } = useI18n()

  /** Textual value for the two duration cards. */
  const durationText: Partial<Record<keyof DerivedStats, string>> = {
    elapsedMs: formatDuration(stats.elapsedMs),
    avgMs: stats.avgMs > 0 ? formatDuration(stats.avgMs) : '—',
  }

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5" data-testid="stats-grid">
      {DEFINITIONS.map((definition) => {
        const Icon = definition.icon
        const isDuration = DURATION_KEYS.has(definition.key)

        return (
          <Card key={String(definition.key)} className="gap-0 py-3" title={t(definition.hint)}>
            <CardContent className="flex items-start justify-between gap-2 px-3">
              <div className="min-w-0">
                <p className="truncate text-xs text-muted-foreground">{t(definition.label)}</p>
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
                      <AnimatedNumber value={Number(stats[definition.key] ?? 0)} />
                      {definition.suffix ? (
                        <span className="ml-0.5 text-xs font-normal text-muted-foreground">
                          {t(definition.suffix)}
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