/**
 * SEO workspace: site-wide summary, issue list, sortable table and a per-page detail.
 *
 * Everything here is computed from the crawl archive with pure functions
 * (`lib/seo/*`), memoised on the archive identity so the 1-second crawl sampler does
 * not re-score thousands of pages.
 *
 * SEO 工作區：全站摘要、問題清單、可排序表格與單頁詳情。
 * 全部由抓取結果以純函式（`lib/seo/*`）計算，並以陣列身分做記憶化，
 * 避免每秒的取樣重算數千頁。
 */
'use client'

import { useMemo, useRef, useState } from 'react'
import { AlertTriangle, ChevronDown, ChevronUp, Search, X } from 'lucide-react'

import { useI18n } from '@/components/providers/LocaleProvider'
import { SerpPanel } from '@/components/dashboard/SerpPanel'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useVirtualWindow } from '@/hooks/useVirtualWindow'
import type { UseSerpResult } from '@/hooks/serp'
import { CHECK_FIX_KEY, CHECK_LABEL_KEY, ISSUE_LABEL_KEY, STATUS_STYLE, scoreStyle } from '@/lib/seo/labels'
import { buildSeoReport, countReportFindings } from '@/lib/seo/report'
import { contextFromReport, scorePage } from '@/lib/seo/score'
import { cn } from '@/lib/utils'
import type { UrlRecord } from '@/types/crawl'
import type { SeoReport, SeoScore } from '@/types/seo'

/** Fixed row height; must match the virtual window's `rowHeight`. */
const ROW_HEIGHT = 44

/** Shared column template for the header and every row. */
const GRID = 'grid grid-cols-[72px_minmax(0,1fr)_64px_64px_48px_64px_64px_76px] items-center gap-2'

/** One scored page. */
interface ScoredRow {
  record: UrlRecord
  seo: SeoScore
}

/**
 * Count the pages referenced by one report group.
 *
 * Report groups are either `string[]` (single-URL findings) or duplicate groups with
 * a `urls` list, so the two shapes are handled here.
 */
function issueCount(value: SeoReport[keyof SeoReport]): number {
  const entries = value as Array<string | { urls: string[] }>
  return entries.reduce((sum, entry) => sum + (typeof entry === 'string' ? 1 : entry.urls.length), 0)
}

interface SeoTabProps {
  /** The crawl archive. */
  records: UrlRecord[]
  /** The SERP workspace (rankings + competitor comparison). */
  serp: UseSerpResult
}

/** The SEO workspace: an on-page **audit** tab and a **SERP rank** tab. */
export function SeoTab({ records, serp }: SeoTabProps) {
  const { t } = useI18n()

  return (
    <Tabs defaultValue="audit">
      <TabsList>
        <TabsTrigger value="audit">{t('seo.tab.audit')}</TabsTrigger>
        <TabsTrigger value="serp">{t('seo.tab.serp')}</TabsTrigger>
      </TabsList>
      <TabsContent value="audit" className="mt-3">
        <SeoAuditView records={records} />
      </TabsContent>
      <TabsContent value="serp" className="mt-3">
        <SerpPanel records={records} serp={serp} />
      </TabsContent>
    </Tabs>
  )
}

/** The on-page audit view. */
function SeoAuditView({ records }: { records: UrlRecord[] }) {
  const { t } = useI18n()
  const [query, setQuery] = useState('')
  const [onlyIssues, setOnlyIssues] = useState(false)
  const [sortDesc, setSortDesc] = useState(true)
  const [selected, setSelected] = useState<string | null>(null)
  const containerRef = useRef<HTMLDivElement | null>(null)

  /** Site-wide report; recomputed only when the archive changes. */
  const report = useMemo(() => buildSeoReport(records), [records])
  const context = useMemo(() => contextFromReport(report), [report])

  /** Every audited page with its score. */
  const scored = useMemo<ScoredRow[]>(
    () =>
      records
        .filter((record) => record.seo)
        .map((record) => ({ record, seo: scorePage(record, context) })),
    [records, context],
  )

  /** Summary numbers. */
  const summary = useMemo(() => {
    const scores = scored.map((row) => row.seo.score ?? 0)
    const average = scores.length === 0 ? null : Math.round(scores.reduce((a, b) => a + b, 0) / scores.length)
    return {
      average,
      audited: scored.length,
      critical: scores.filter((score) => score < 60).length,
      findings: countReportFindings(report),
    }
  }, [scored, report])

  /** Rows after search / issue filter / sorting. */
  const rows = useMemo(() => {
    const keyword = query.trim().toLowerCase()
    const problematic = new Set([
      ...report.missingTitle,
      ...report.missingDescription,
      ...report.multipleH1,
      ...report.notIndexable,
      ...report.thinContent,
      ...report.canonicalMismatch,
      ...report.duplicateTitles.flatMap((group) => group.urls),
      ...report.duplicateDescriptions.flatMap((group) => group.urls),
    ])

    const filtered = scored.filter(({ record, seo }) => {
      if (onlyIssues) {
        const hasIssue = problematic.has(record.url) || seo.checks.some((check) => check.status === 'fail')
        if (!hasIssue) return false
      }
      if (!keyword) return true
      return (
        record.url.toLowerCase().includes(keyword) ||
        (record.seo?.title?.toLowerCase().includes(keyword) ?? false)
      )
    })

    return filtered.sort((a, b) => {
      const left = a.seo.score ?? -1
      const right = b.seo.score ?? -1
      return sortDesc ? right - left : left - right
    })
  }, [scored, query, onlyIssues, sortDesc, report])

  const list = useVirtualWindow({ count: rows.length, rowHeight: ROW_HEIGHT, overscan: 6 })
  const visible = rows.slice(list.startIndex, list.endIndex)
  const selectedRow = scored.find((row) => row.record.url === selected) ?? null

  if (scored.length === 0) {
    return (
      <Card>
        <CardContent className="flex h-[240px] flex-col items-center justify-center gap-1 text-sm text-muted-foreground">
          {t('seo.empty')}
          <span className="text-xs">{t('seo.emptyHint')}</span>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="flex flex-col gap-3">
      {/* Summary + disclaimer */}
      <Card>
        <CardHeader className="gap-2 pb-3">
          <CardTitle className="text-base">{t('seo.title')}</CardTitle>
          <p className="text-xs text-muted-foreground">{t('seo.disclaimer')}</p>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat label={t('seo.avgScore')} value={summary.average === null ? '—' : String(summary.average)} />
          <Stat label={t('seo.audited')} value={summary.audited.toLocaleString()} />
          <Stat label={t('seo.criticalPages')} value={summary.critical.toLocaleString()} />
          <Stat label={t('seo.issuesFound')} value={summary.findings.toLocaleString()} />
        </CardContent>
      </Card>

      {/* Site-wide issues */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <AlertTriangle className="size-4 text-muted-foreground" />
            {t('seo.issuesTitle')}
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          {(Object.keys(ISSUE_LABEL_KEY) as Array<keyof SeoReport>).map((key) => {
            const count = issueCount(report[key])
            return (
              <Badge
                key={key}
                variant="outline"
                className={cn('gap-1', count > 0 && 'border-amber-500/40 text-amber-700 dark:text-amber-300')}
              >
                {t(ISSUE_LABEL_KEY[key])}
                <span className="tabular-nums">{count.toLocaleString()}</span>
              </Badge>
            )
          })}
        </CardContent>
      </Card>

      {/* Table */}
      <Card className="min-w-0">
        <CardHeader className="gap-3 pb-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <CardTitle className="text-base">
              {t('seo.tableTitle')}
              <span className="ml-2 text-xs font-normal text-muted-foreground">
                {rows.length.toLocaleString()} / {scored.length.toLocaleString()}
              </span>
            </CardTitle>

            <div className="flex flex-wrap items-center gap-2">
              <div className="relative">
                <Search className="pointer-events-none absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
                <Input
                  name="seo-search"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder={t('seo.searchPlaceholder')}
                  className="h-8 w-52 pl-7 text-xs"
                />
              </div>

              <Label className="flex items-center gap-2 text-xs text-muted-foreground">
                <Switch checked={onlyIssues} onCheckedChange={setOnlyIssues} />
                {t('seo.onlyIssues')}
              </Label>

              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8 text-xs"
                onClick={() => setSortDesc((value) => !value)}
              >
                {t('seo.sortByScore')}
                {sortDesc ? <ChevronDown className="ml-1 size-3" /> : <ChevronUp className="ml-1 size-3" />}
              </Button>
            </div>
          </div>

          <div className={cn(GRID, 'rounded-md bg-muted/60 px-2 py-1.5 text-[11px] font-medium text-muted-foreground')}>
            <span>{t('seo.col.score')}</span>
            <span>{t('seo.col.url')}</span>
            <span className="text-right">{t('seo.col.titleLength')}</span>
            <span className="text-right">{t('seo.col.descLength')}</span>
            <span className="text-right">{t('seo.col.h1')}</span>
            <span className="text-right">{t('seo.col.imagesMissingAlt')}</span>
            <span className="text-right">{t('seo.col.wordCount')}</span>
            <span className="text-center">{t('seo.col.indexable')}</span>
          </div>
        </CardHeader>

        <CardContent className="px-3">
          <div
            ref={containerRef}
            onScroll={list.onScroll}
            className="h-[420px] overflow-y-auto rounded-md border"
          >
            {rows.length === 0 ? (
              <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                {t('urls.noMatch')}
              </div>
            ) : (
              <div className="relative" style={{ height: list.totalHeight }}>
                <div
                  className="absolute inset-x-0 top-0"
                  style={{ transform: `translateY(${list.paddingTop}px)` }}
                >
                  {visible.map(({ record, seo }) => (
                    <button
                      key={record.url}
                      type="button"
                      onClick={() => setSelected(record.url)}
                      className={cn(
                        GRID,
                        'w-full border-b px-2 text-left text-xs transition-colors last:border-b-0 hover:bg-muted/40',
                        selected === record.url && 'bg-muted/60',
                      )}
                      style={{ height: ROW_HEIGHT }}
                    >
                      <span
                        className={cn(
                          'inline-flex w-11 justify-center rounded-full px-2 py-0.5 text-[11px] font-semibold tabular-nums',
                          scoreStyle(seo.score),
                        )}
                      >
                        {seo.score ?? '—'}
                      </span>
                      <span className="truncate font-mono text-[11px]" title={record.url}>
                        {record.url}
                      </span>
                      <span className="text-right tabular-nums text-muted-foreground">
                        {record.seo?.titleLength ?? '—'}
                      </span>
                      <span className="text-right tabular-nums text-muted-foreground">
                        {record.seo?.metaDescriptionLength ?? '—'}
                      </span>
                      <span className="text-right tabular-nums text-muted-foreground">
                        {record.seo?.h1.length ?? '—'}
                      </span>
                      <span className="text-right tabular-nums text-muted-foreground">
                        {record.seo?.images.total
                          ? `${record.seo.images.missingAlt}/${record.seo.images.total}`
                          : '—'}
                      </span>
                      <span className="text-right tabular-nums text-muted-foreground">
                        {record.seo?.wordCount ?? '—'}
                      </span>
                      <span className="text-center">
                        <Badge
                          variant="outline"
                          className={cn(
                            'px-1 py-0 text-[10px]',
                            record.seo?.indexable === false && 'border-destructive/40 text-destructive',
                          )}
                        >
                          {record.seo?.indexable === false
                            ? t('seo.indexable.no')
                            : t('seo.indexable.yes')}
                        </Badge>
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Detail */}
      {selectedRow ? <SeoDetail row={selectedRow} onClose={() => setSelected(null)} /> : null}
    </div>
  )
}

/** A small labelled number. */
function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border bg-muted/30 px-3 py-2">
      <p className="truncate text-xs text-muted-foreground">{label}</p>
      <p className="mt-0.5 text-xl font-semibold tabular-nums">{value}</p>
    </div>
  )
}

/** Per-page detail: extracted values plus every check with its fix hint. */
function SeoDetail({ row, onClose }: { row: ScoredRow; onClose: () => void }) {
  const { t } = useI18n()
  const { record, seo } = row
  const snapshot = record.seo

  /** Extracted fields worth showing, in a stable order. */
  const facts: Array<{ label: string; value: string }> = snapshot
    ? [
        { label: 'title', value: snapshot.title ?? '—' },
        { label: 'description', value: snapshot.metaDescription ?? '—' },
        { label: 'canonical', value: snapshot.canonical ?? '—' },
        { label: 'robots', value: snapshot.metaRobots ?? '—' },
        { label: 'lang', value: snapshot.lang ?? '—' },
        { label: 'h1', value: snapshot.h1.length ? snapshot.h1.join(' | ') : '—' },
        { label: 'links', value: `${snapshot.links.internal} / ${snapshot.links.external} / ${snapshot.links.nofollow}` },
        { label: 'structuredData', value: snapshot.structuredData.join(', ') || '—' },
        {
          label: t('seo.col.keywords'),
          value: snapshot.keywords.map((keyword) => `${keyword.term}(${keyword.count})`).join(', ') || '—',
        },
      ]
    : []

  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between gap-2 pb-3">
        <div className="min-w-0">
          <CardTitle className="text-base">{t('seo.detailTitle')}</CardTitle>
          <p className="mt-1 break-all font-mono text-[11px] text-muted-foreground">{record.url}</p>
        </div>
        <div className="flex items-center gap-2">
          <span
            className={cn(
              'inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold tabular-nums',
              scoreStyle(seo.score),
            )}
          >
            {seo.score ?? '—'}
          </span>
          <Button type="button" variant="ghost" size="icon-sm" onClick={onClose} title={t('urls.clearFilters')}>
            <X className="size-3.5" />
          </Button>
        </div>
      </CardHeader>

      <CardContent className="grid gap-4 lg:grid-cols-2">
        {/* Checks */}
        <div className="flex flex-col gap-1.5">
          <p className="text-xs font-medium text-muted-foreground">{t('seo.checksTitle')}</p>
          {seo.checks.map((check) => (
            <div key={check.id} className="flex items-start gap-2 text-xs">
              <span
                className={cn(
                  'mt-0.5 inline-flex w-16 shrink-0 justify-center rounded-full px-1.5 py-0.5 text-[10px] font-semibold',
                  STATUS_STYLE[check.status],
                )}
              >
                {t(`seo.status.${check.status}`)}
              </span>
              <span className="min-w-0">
                <span className="text-foreground">{t(CHECK_LABEL_KEY[check.id])}</span>
                {check.value !== undefined && check.value !== null ? (
                  <span className="ml-1 tabular-nums text-muted-foreground">({String(check.value)})</span>
                ) : null}
                {check.status === 'fail' || check.status === 'warn' ? (
                  <span className="block text-muted-foreground">{t(CHECK_FIX_KEY[check.id])}</span>
                ) : null}
              </span>
            </div>
          ))}
        </div>

        {/* Extracted values */}
        <div className="flex flex-col gap-1.5">
          <p className="text-xs font-medium text-muted-foreground">{t('seo.detailExtracted')}</p>
          <dl className="flex flex-col gap-1 text-xs">
            {facts.map((fact) => (
              <div key={fact.label} className="flex gap-2">
                <dt className="w-28 shrink-0 font-mono text-muted-foreground">{fact.label}</dt>
                <dd className="min-w-0 break-words">{fact.value}</dd>
              </div>
            ))}
          </dl>
        </div>
      </CardContent>
    </Card>
  )
}