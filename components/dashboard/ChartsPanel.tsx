/**
 * Progress visualisation: a radial completion gauge plus an area chart of
 * "已完成 / 待处理" over time.
 *
 * Both charts read the same {@link HistoryPoint} stream the crawl engine samples
 * once per second while running.
 *
 * 進度視覺化：環形完成度，以及「已完成／待處理」隨時間變化的面積圖。
 * 兩張圖都讀取抓取引擎在執行期間每秒採樣的同一份歷史資料。
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

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import type { DerivedStats } from '@/lib/stats'
import type { HistoryPoint } from '@/types/crawl'

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

/** Collapsible chart section. */
export function ChartsPanel({ stats, history }: ChartsPanelProps) {
  const [open, setOpen] = useState(true)

  /** Map the raw samples into chart-friendly rows. */
  const trend = useMemo(
    () =>
      history.map((point) => ({
        t: formatClock(point.t),
        done: point.done,
        pending: point.pending,
      })),
    [history],
  )

  /** Single data point driving the radial gauge. */
  const ringData = useMemo(
    () => [{ name: '完成度', value: stats.progressPct }],
    [stats.progressPct],
  )

  const handled = stats.processed + stats.pending + stats.crawling

  return (
    <Card>
      <CardHeader className="pb-2">
        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          className="flex w-full items-center justify-between text-left"
          aria-expanded={open}
        >
          <CardTitle className="flex items-center gap-2 text-base">
            <LineChart className="size-4 text-muted-foreground" />
            进度可视化
          </CardTitle>
          <span className="flex items-center gap-1 text-xs text-muted-foreground">
            {open ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
            {open ? '收起' : '展开'}
          </span>
        </button>
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
                开始抓取后这里会显示「已完成 / 待处理」随时间的变化
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={trend} margin={{ top: 6, right: 8, bottom: 0, left: -18 }}>
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
                    width={40}
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
                    name="待处理"
                    stroke="var(--chart-2)"
                    fill="var(--chart-2)"
                    fillOpacity={0.18}
                    strokeWidth={1.5}
                  />
                  <Area
                    type="monotone"
                    dataKey="done"
                    name="已完成"
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