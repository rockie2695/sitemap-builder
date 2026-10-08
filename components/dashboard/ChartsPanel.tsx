/**
 * Progress visualisation: a radial completion gauge plus an area chart of
 * "done / pending" over time.
 *
 * The trend can show either a rolling window (recent) or the whole history since the
 * task started; the choice is remembered like the view mode.
 *
 * 進度視覺化：環形完成度，以及「已完成／待處理」隨時間變化的面積圖。
 * 趨勢可顯示滾動視窗（當前時段）或自開始以來的全部資料；選擇會像檢視模式一樣被記住。
 */
'use client'

import { useMemo, useState } from 'react'
import {
  Area,
  AreaChart,
  CartesianGrid,
  PolarAngleAxis,
  RadialBar,
  RadialBarChart,
  ResponsiveContainer,
  Tooltip as ChartTooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { ChevronDown, ChevronRight, LineChart } from 'lucide-react'

import { useI18n } from '@/components/providers/LocaleProvider'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { useStoredState } from '@/hooks/useStoredState'
import { formatAxisNumber, yAxisWidthFor } from '@/lib/charts'
import type { DerivedStats } from '@/lib/stats'
import type { HistoryPoint } from '@/types/crawl'

/** How much of the history the trend chart shows. */
type ChartPeriod = 'current' | 'full'

/** Samples shown in the "current" period (1 sample/s → one minute). */
const CURRENT_WINDOW_SAMPLES = 60

interface ChartsPanelProps {
  /** Derived counters. */
  stats: DerivedStats
  /** Throughput samples from the crawl engine. */
  history: HistoryPoint[]
}

/** `HH:mm:ss` axis label. */
function formatClock(ts: number): string {
  const date = new Date(ts)
  const pad = (value: number) => String(value).padStart(2, '0')
  return `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
}

/** Collapsible chart section with a period switch. */
export function ChartsPanel({ stats, history }: ChartsPanelProps) {
  const { t } = useI18n()
  const [open, setOpen] = useState(true)
  const [period, setPeriod] = useStoredState<ChartPeriod>('chart-period', 'current')

  /** Samples actually rendered, honouring the period switch. */
  const samples = useMemo(
    () => (period === 'current' ? history.slice(-CURRENT_WINDOW_SAMPLES) : history),
    [history, period],
  )

  /** Largest value on the Y axis, used to size its label gutter. */
  const maxValue = useMemo(
    () => samples.reduce((max, point) => Math.max(max, point.done, point.pending), 0),
    [samples],
  )

  const trend = useMemo(
    () => samples.map((point) => ({ t: formatClock(point.t), done: point.done, pending: point.pending })),
    [samples],
  )

  /** Single data point driving the radial gauge. */
  const ringData = useMemo(() => [{ name: 'progress', value: stats.progressPct }], [stats.progressPct])

  const handled = stats.processed + stats.pending + stats.crawling

  return (
    <Card>
      <CardHeader className="flex-row flex-wrap items-center justify-between gap-2 pb-2">
        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          className="flex items-center gap-2 text-left"
          aria-expanded={open}
        >
          <CardTitle className="flex items-center gap-2 text-base">
            <LineChart className="size-4 text-muted-foreground" />
            {t('charts.title')}
          </CardTitle>
          <span className="flex items-center gap-1 text-xs text-muted-foreground">
            {open ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
            {open ? t('charts.collapse') : t('charts.expand')}
          </span>
        </button>

        <ToggleGroup
          type="single"
          value={period}
          onValueChange={(next) => {
            if (next) setPeriod(next as ChartPeriod)
          }}
          variant="outline"
          size="sm"
          aria-label={t('charts.period.hint')}
          title={t('charts.period.hint')}
        >
          <ToggleGroupItem value="current" className="text-xs">
            {t('charts.period.current')}
          </ToggleGroupItem>
          <ToggleGroupItem value="full" className="text-xs">
            {t('charts.period.full')}
          </ToggleGroupItem>
        </ToggleGroup>
      </CardHeader>

      {open ? (
        <CardContent className="grid gap-4 lg:grid-cols-[240px_minmax(0,1fr)]">
          {/* Radial completion gauge */}
          <div className="relative h-[180px]">
            <ResponsiveContainer width="100%" height="100%">
              <RadialBarChart
                data={ringData}
                innerRadius="72%"
                outerRadius="100%"
                startAngle={90}
                endAngle={-270}
              >
                <PolarAngleAxis type="number" domain={[0, 100]} angleAxisId={0} tick={false} />
                <RadialBar
                  dataKey="value"
                  angleAxisId={0}
                  cornerRadius={12}
                  fill="var(--color-emerald-500)"
                  background={{ fill: 'var(--muted)' }}
                />
              </RadialBarChart>
            </ResponsiveContainer>
            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-2xl font-semibold tabular-nums">{stats.progressPct}%</span>
              <span className="text-xs text-muted-foreground">
                {stats.processed} / {handled}
              </span>
            </div>
          </div>

          {/* Throughput / queue trend */}
          <div className="h-[180px]">
            {trend.length < 2 ? (
              <div className="flex h-full items-center justify-center rounded-md border border-dashed text-sm text-muted-foreground">
                {t('charts.empty')}
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={trend} margin={{ top: 6, right: 8, bottom: 0, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                  <XAxis
                    dataKey="t"
                    tick={{ fontSize: 10, fill: 'var(--muted-foreground)' }}
                    axisLine={false}
                    tickLine={false}
                    minTickGap={40}
                  />
                  <YAxis
                    tick={{ fontSize: 10, fill: 'var(--muted-foreground)' }}
                    axisLine={false}
                    tickLine={false}
                    // Width tracks the largest label so thousands are never clipped.
                    width={yAxisWidthFor(maxValue)}
                    tickFormatter={formatAxisNumber}
                  />
                  <ChartTooltip
                    contentStyle={{
                      background: 'var(--popover)',
                      border: '1px solid var(--border)',
                      borderRadius: 8,
                      fontSize: 12,
                      color: 'var(--popover-foreground)',
                    }}
                  />
                  <Area
                    type="monotone"
                    dataKey="pending"
                    name={t('charts.series.pending')}
                    stroke="var(--chart-2)"
                    fill="var(--chart-2)"
                    fillOpacity={0.18}
                    strokeWidth={1.5}
                  />
                  <Area
                    type="monotone"
                    dataKey="done"
                    name={t('charts.series.done')}
                    stroke="var(--color-emerald-500)"
                    fill="var(--color-emerald-500)"
                    fillOpacity={0.22}
                    strokeWidth={1.5}
                  />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>
        </CardContent>
      ) : null}
    </Card>
  )
}