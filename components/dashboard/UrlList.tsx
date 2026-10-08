/**
 * Discovered-URL table: search, status filter, virtual scrolling, per-row actions.
 *
 * Rows are windowed (`hooks/useVirtualWindow.ts`) so tens of thousands of URLs stay
 * smooth; the row height here MUST match `ROW_HEIGHT` or the list will drift.
 *
 * 已發現 URL 的表格：搜尋、狀態篩選、虛擬滾動與列內操作。
 * 透過 `hooks/useVirtualWindow.ts` 做視窗化，數萬筆 URL 仍流暢；
 * 這裡的列高必須與 `ROW_HEIGHT` 一致，否則會出現錯位。
 */
'use client'

import { useMemo, useRef, useState } from 'react'
import { Check, Copy, ExternalLink, ListTree, Search, X } from 'lucide-react'

import { useI18n } from '@/components/providers/LocaleProvider'
import { Badge } from '@/components/ui/badge'
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
import { Skeleton } from '@/components/ui/skeleton'
import { useVirtualWindow } from '@/hooks/useVirtualWindow'
import type { UiKey } from '@/lib/i18n'
import { cn } from '@/lib/utils'
import type { UrlRecord, UrlStatus } from '@/types/crawl'

/** Fixed row height; must match the virtual window's `rowHeight`. */
const ROW_HEIGHT = 44

/** Shared column template for the header and every row. */
const GRID =
  'grid grid-cols-[92px_minmax(0,1fr)_minmax(0,180px)_72px_52px_72px_72px_84px] items-center gap-2'

/** Badge styling per record status; the label is translated. */
const STATUS_STYLE: Record<UrlStatus, string> = {
  queued: 'bg-slate-500/15 text-slate-700 dark:text-slate-300',
  crawling: 'bg-amber-500/20 text-amber-700 dark:text-amber-300',
  done: 'bg-emerald-500/20 text-emerald-700 dark:text-emerald-300',
  failed: 'bg-destructive/15 text-destructive',
}

/** Column header keys, in grid order. */
const COLUMNS: UiKey[] = [
  'urls.col.status',
  'urls.col.url',
  'urls.col.title',
  'urls.col.httpStatus',
  'urls.col.depth',
  'urls.col.foundLinks',
  'urls.col.duration',
  'urls.col.actions',
]

interface UrlListProps {
  /** Archive in discovery order. */
  records: UrlRecord[]
  /** True while the first page is still loading (renders skeleton rows). */
  loading?: boolean
}

/** Placeholder rows shown before the first result arrives. */
function LoadingRows() {
  return (
    <div className="flex flex-col gap-2 p-3">
      {Array.from({ length: 6 }, (_, index) => (
        <div key={index} className="flex items-center gap-2">
          <Skeleton className="h-5 w-16 rounded-full" />
          <Skeleton className="h-4 flex-1" />
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-4 w-10" />
        </div>
      ))}
    </div>
  )
}

/** The discovered-URL table. */
export function UrlList({ records, loading = false }: UrlListProps) {
  const { t } = useI18n()
  const [query, setQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<'all' | UrlStatus>('all')
  const [copiedUrl, setCopiedUrl] = useState<string | null>(null)
  const containerRef = useRef<HTMLDivElement | null>(null)

  /** Apply the search keyword and status filter before virtualisation. */
  const filtered = useMemo(() => {
    const keyword = query.trim().toLowerCase()
    return records.filter((record) => {
      if (statusFilter !== 'all' && record.status !== statusFilter) return false
      if (!keyword) return true
      return (
        record.url.toLowerCase().includes(keyword) ||
        (record.pageTitle?.toLowerCase().includes(keyword) ?? false)
      )
    })
  }, [records, query, statusFilter])

  const list = useVirtualWindow({ count: filtered.length, rowHeight: ROW_HEIGHT, overscan: 6 })

  /** Copy a URL and flash the checkmark. */
  const copy = async (url: string) => {
    try {
      await navigator.clipboard.writeText(url)
      setCopiedUrl(url)
      window.setTimeout(() => setCopiedUrl((current) => (current === url ? null : current)), 1200)
    } catch {
      // Clipboard blocked (non-secure context): nothing to do.
    }
  }

  const visible = filtered.slice(list.startIndex, list.endIndex)
  const filtering = query !== '' || statusFilter !== 'all'

  return (
    <Card className="min-w-0">
      <CardHeader className="gap-3 pb-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <ListTree className="size-4 text-muted-foreground" />
            {t('urls.title')}
            <span className="text-xs font-normal text-muted-foreground">
              {filtered.length.toLocaleString()}
              {filtered.length !== records.length ? ` / ${records.length.toLocaleString()}` : ''}
            </span>
          </CardTitle>

          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <Search className="pointer-events-none absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                name="url-search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={t('urls.searchPlaceholder')}
                className="h-8 w-52 pl-7 text-xs"
              />
            </div>

            <Select
              name="status-filter"
              value={statusFilter}
              onValueChange={(value) => setStatusFilter(value as 'all' | UrlStatus)}
            >
              <SelectTrigger size="sm" className="w-28 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t('urls.status.all')}</SelectItem>
                <SelectItem value="queued">{t('status.queued')}</SelectItem>
                <SelectItem value="crawling">{t('status.crawling')}</SelectItem>
                <SelectItem value="done">{t('status.done')}</SelectItem>
                <SelectItem value="failed">{t('status.failed')}</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Column header (outside the scroll area so it stays put) */}
        <div
          className={cn(
            GRID,
            'rounded-md bg-muted/60 px-2 py-1.5 text-[11px] font-medium text-muted-foreground',
          )}
        >
          {COLUMNS.map((column, index) => (
            <span key={column} className={index >= 3 && index <= 6 ? 'text-right' : undefined}>
              {t(column)}
            </span>
          ))}
        </div>
      </CardHeader>

      <CardContent className="px-3">
        <div
          ref={containerRef}
          onScroll={list.onScroll}
          className="h-[420px] overflow-y-auto rounded-md border"
        >
          {loading && records.length === 0 ? (
            <LoadingRows />
          ) : filtered.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center gap-1 text-sm text-muted-foreground">
              {records.length === 0 ? t('urls.empty') : t('urls.noMatch')}
              {records.length === 0 ? (
                <span className="text-xs">{t('urls.emptyHint')}</span>
              ) : null}
            </div>
          ) : (
            <div className="relative" style={{ height: list.totalHeight }}>
              {/* Offset the window so the scrollbar reflects the full list height. */}
              <div
                className="absolute inset-x-0 top-0"
                style={{ transform: `translateY(${list.paddingTop}px)` }}
              >
                {visible.map((record) => (
                  <div
                    key={record.url}
                    className={cn(
                      GRID,
                      'border-b px-2 text-xs transition-colors last:border-b-0 hover:bg-muted/40',
                    )}
                    style={{ height: ROW_HEIGHT }}
                  >
                    <span
                      className={cn(
                        'inline-flex w-[76px] justify-center rounded-full px-2 py-0.5 text-[11px] font-medium',
                        STATUS_STYLE[record.status],
                      )}
                    >
                      {t(`status.${record.status}`)}
                    </span>

                    <span className="flex min-w-0 items-center gap-1">
                      <a
                        href={record.url}
                        target="_blank"
                        rel="noreferrer noopener"
                        title={record.url}
                        className="truncate font-mono text-[11px] text-foreground hover:underline"
                      >
                        {record.url}
                      </a>
                      {record.redirected ? (
                        <span
                          className="shrink-0 text-amber-600 dark:text-amber-400"
                          title={t('urls.redirectedHint')}
                        >
                          ↪
                        </span>
                      ) : null}
                    </span>

                    <span
                      className="truncate text-[11px] text-muted-foreground"
                      title={record.pageTitle ?? ''}
                    >
                      {record.pageTitle ?? (record.error ? `⚠ ${record.error}` : '—')}
                    </span>

                    <span className="text-right tabular-nums">
                      {record.httpStatus === null ? (
                        '—'
                      ) : (
                        <Badge
                          variant="outline"
                          className={cn(
                            'px-1 py-0 text-[10px] tabular-nums',
                            record.httpStatus >= 400 && 'border-destructive/40 text-destructive',
                          )}
                        >
                          {record.httpStatus}
                        </Badge>
                      )}
                    </span>

                    <span className="text-right tabular-nums text-muted-foreground">
                      {record.depth}
                    </span>
                    <span className="text-right tabular-nums text-muted-foreground">
                      {record.foundLinks}
                    </span>
                    <span className="text-right tabular-nums text-muted-foreground">
                      {record.durationMs === null
                        ? '—'
                        : `${(record.durationMs / 1000).toFixed(1)}s`}
                    </span>

                    <span className="flex items-center justify-end gap-1">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        title={copiedUrl === record.url ? t('urls.copied') : t('urls.copy')}
                        onClick={() => copy(record.url)}
                      >
                        {copiedUrl === record.url ? (
                          <Check className="size-3.5 text-emerald-600" />
                        ) : (
                          <Copy className="size-3.5" />
                        )}
                      </Button>
                      <Button variant="ghost" size="icon-sm" title={t('urls.open')} asChild>
                        <a href={record.url} target="_blank" rel="noreferrer noopener">
                          <ExternalLink className="size-3.5" />
                        </a>
                      </Button>
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {filtering ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="mt-2 h-7 text-xs"
            onClick={() => {
              setQuery('')
              setStatusFilter('all')
            }}
          >
            <X className="mr-1 size-3" />
            {t('urls.clearFilters')}
          </Button>
        ) : null}
      </CardContent>
    </Card>
  )
}