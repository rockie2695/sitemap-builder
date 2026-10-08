/**
 * Live log panel: level filter, keyword search, auto-follow and export.
 *
 * Rows are virtualised like the URL table; `ROW_HEIGHT` must match the virtual
 * window's `rowHeight`.
 *
 * 即時日誌面板：等級篩選、關鍵字搜尋、自動跟隨與匯出。
 * 與 URL 表格相同採視窗化，`ROW_HEIGHT` 必須與虛擬視窗的 `rowHeight` 一致。
 */
'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import type { UIEvent } from 'react'
import { Download, Eraser, ScrollText, Search } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { useVirtualWindow } from '@/hooks/useVirtualWindow'
import { buildLogText, downloadFile } from '@/lib/export'
import { cn } from '@/lib/utils'
import { isElementAtBottom, scrollElementToEnd } from '@/lib/virtual'
import type { LogEntry, LogLevel } from '@/types/crawl'

/** Fixed row height; must match the virtual window's `rowHeight`. */
const ROW_HEIGHT = 26

/** Colour + label per log level. */
const LEVEL_META: Record<LogLevel, { label: string; dot: string; text: string }> = {
  info: { label: 'INFO', dot: 'bg-slate-400', text: 'text-slate-700 dark:text-slate-300' },
  success: {
    label: 'OK',
    dot: 'bg-emerald-500',
    text: 'text-emerald-700 dark:text-emerald-300',
  },
  warn: { label: 'WARN', dot: 'bg-amber-500', text: 'text-amber-700 dark:text-amber-300' },
  error: { label: 'ERROR', dot: 'bg-destructive', text: 'text-destructive' },
}

/** `HH:mm:ss` prefix used in the panel and in the exported file. */
function formatTime(ts: number): string {
  const date = new Date(ts)
  const pad = (value: number) => String(value).padStart(2, '0')
  return `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
}

interface LogPanelProps {
  /** Log entries in chronological order. */
  logs: LogEntry[]
  /** Drop every entry (the buffer is only in memory). */
  onClear: () => void
}

/** The live log panel. */
export function LogPanel({ logs, onClear }: LogPanelProps) {
  const [levelFilter, setLevelFilter] = useState<'all' | LogLevel>('all')
  const [query, setQuery] = useState('')
  const [autoScroll, setAutoScroll] = useState(true)
  /** Set when the user scrolls away, so we only disable auto-follow once. */
  const userScrolledRef = useRef(false)
  const containerRef = useRef<HTMLDivElement | null>(null)

  /** Apply the level filter and keyword search. */
  const filtered = useMemo(() => {
    const keyword = query.trim().toLowerCase()
    return logs.filter((entry) => {
      if (levelFilter !== 'all' && entry.level !== levelFilter) return false
      if (!keyword) return true
      return entry.message.toLowerCase().includes(keyword)
    })
  }, [logs, levelFilter, query])

  const list = useVirtualWindow({ count: filtered.length, rowHeight: ROW_HEIGHT, overscan: 10 })

  // Keep the newest entry visible while auto-follow is on.
  useEffect(() => {
    if (!autoScroll) return
    scrollElementToEnd(containerRef.current)
  }, [autoScroll, filtered.length])

  /** Window update + "user scrolled away, stop following" detection. */
  const handleScroll = (event: UIEvent<HTMLDivElement>) => {
    list.onScroll(event)
    if (userScrolledRef.current && !isElementAtBottom(containerRef.current)) {
      userScrolledRef.current = false
      setAutoScroll(false)
    }
  }

  const visible = filtered.slice(list.startIndex, list.endIndex)

  return (
    <Card className="min-w-0">
      <CardHeader className="gap-3 pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <ScrollText className="size-4 text-muted-foreground" />
          实时日志
          <span className="text-xs font-normal text-muted-foreground">
            {filtered.length.toLocaleString()}
            {filtered.length !== logs.length ? ` / ${logs.length.toLocaleString()}` : ''}
          </span>
        </CardTitle>

        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              name="log-search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="搜索日志"
              className="h-8 w-40 pl-7 text-xs"
            />
          </div>

          <Select
            name="level-filter"
            value={levelFilter}
            onValueChange={(value) => setLevelFilter(value as 'all' | LogLevel)}
          >
            <SelectTrigger size="sm" className="w-28 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">全部级别</SelectItem>
              <SelectItem value="info">INFO</SelectItem>
              <SelectItem value="success">OK</SelectItem>
              <SelectItem value="warn">WARN</SelectItem>
              <SelectItem value="error">ERROR</SelectItem>
            </SelectContent>
          </Select>

          <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Switch
              checked={autoScroll}
              onCheckedChange={(checked) => {
                userScrolledRef.current = false
                setAutoScroll(checked)
              }}
            />
            自动滚动
          </label>

          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            title="导出日志"
            onClick={() => downloadFile('crawl-log.txt', buildLogText(logs), 'text/plain')}
          >
            <Download className="size-3.5" />
          </Button>
          <Button type="button" variant="ghost" size="icon-sm" title="清空日志" onClick={onClear}>
            <Eraser className="size-3.5" />
          </Button>
        </div>
      </CardHeader>

      <CardContent className="px-3">
        <div
          ref={containerRef}
          onScroll={handleScroll}
          className="h-[420px] overflow-y-auto rounded-md border bg-muted/20 font-mono text-[11px]"
        >
          {filtered.length === 0 ? (
            <div className="flex h-full items-center justify-center font-sans text-sm text-muted-foreground">
              暂无日志
            </div>
          ) : (
            <div className="relative" style={{ height: list.totalHeight }}>
              <div
                className="absolute inset-x-0 top-0"
                style={{ transform: `translateY(${list.paddingTop}px)` }}
              >
                {visible.map((entry) => {
                  const meta = LEVEL_META[entry.level]
                  return (
                    <div
                      key={entry.id}
                      className="flex items-center gap-2 border-b border-border/40 px-2 transition-colors last:border-b-0 hover:bg-muted/30"
                      style={{ height: ROW_HEIGHT }}
                      title={entry.message}
                    >
                      <span className="shrink-0 text-muted-foreground">{formatTime(entry.ts)}</span>
                      <span
                        className={cn(
                          'inline-flex w-10 shrink-0 items-center gap-1 font-semibold',
                          meta.text,
                        )}
                      >
                        <span className={cn('size-1.5 rounded-full', meta.dot)} />
                        {meta.label}
                      </span>
                      <span className="truncate">{entry.message}</span>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  )
}