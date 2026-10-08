/**
 * Live log panel: level filter, keyword search, auto-follow and export.
 *
 * Log entries are structured (i18n key + params), so the panel renders them for the
 * active locale, and filtering happens on the rendered text.
 *
 * 即時日誌面板：等級篩選、關鍵字搜尋、自動跟隨與匯出。
 * 日誌條目是結構化的（i18n 鍵 + 參數），因此面板以當前語系呈現，篩選也針對呈現後文字。
 */
'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import type { UIEvent } from 'react'
import { Download, Eraser, ScrollText, Search } from 'lucide-react'

import { useI18n } from '@/components/providers/LocaleProvider'
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

/** Colour + label per log level (labels are conventional, not translated). */
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
  const { t, tLog, locale } = useI18n()
  const [levelFilter, setLevelFilter] = useState<'all' | LogLevel>('all')
  const [query, setQuery] = useState('')
  const [autoScroll, setAutoScroll] = useState(true)
  /** Set when the user scrolls away, so we only disable auto-follow once. */
  const userScrolledRef = useRef(false)
  const containerRef = useRef<HTMLDivElement | null>(null)

  /** Render every entry once, then filter on the rendered text. */
  const rendered = useMemo(
    () => logs.map((entry) => ({ entry, text: tLog(entry) })),
    [logs, tLog],
  )

  /** Apply the level filter and keyword search. */
  const filtered = useMemo(() => {
    const keyword = query.trim().toLowerCase()
    return rendered.filter(({ entry, text }) => {
      if (levelFilter !== 'all' && entry.level !== levelFilter) return false
      if (!keyword) return true
      return text.toLowerCase().includes(keyword)
    })
  }, [rendered, levelFilter, query])

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
          {t('logs.title')}
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
              placeholder={t('logs.searchPlaceholder')}
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
              <SelectItem value="all">{t('logs.level.all')}</SelectItem>
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
            {t('logs.autoScroll')}
          </label>

          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            title={t('logs.export')}
            onClick={() => downloadFile('crawl-log.txt', buildLogText(logs, locale), 'text/plain')}
          >
            <Download className="size-3.5" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            title={t('logs.clear')}
            onClick={onClear}
          >
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
              {t('logs.empty')}
            </div>
          ) : (
            <div className="relative" style={{ height: list.totalHeight }}>
              <div
                className="absolute inset-x-0 top-0"
                style={{ transform: `translateY(${list.paddingTop}px)` }}
              >
                {visible.map(({ entry, text }) => {
                  const meta = LEVEL_META[entry.level]
                  return (
                    <div
                      key={entry.id}
                      className="flex items-center gap-2 border-b border-border/40 px-2 transition-colors last:border-b-0 hover:bg-muted/30"
                      style={{ height: ROW_HEIGHT }}
                      title={text}
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
                      <span className="truncate">{text}</span>
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