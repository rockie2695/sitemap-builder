/**
 * SEO workspace: site-wide summary, issue list, sortable table and a per-page detail,
 * plus an optional GA4 traffic overlay and AI rewrite suggestions.
 *
 * Everything here is computed from the crawl archive with pure functions (`lib/seo/*`),
 * memoised on the archive identity so the 1-second crawl sampler does not re-score
 * thousands of pages.
 *
 * SEO 工作區：全站摘要、問題清單、可排序表格與單頁詳情，另有選用的 GA4 流量疊加與
 * AI 改寫建議。全部由抓取結果以純函式（`lib/seo/*`）計算，並以陣列身分做記憶化，
 * 避免每秒的取樣重算數千頁。
 */
'use client'

import { useMemo, useRef, useState } from 'react'
import { AlertTriangle, ChevronDown, ChevronUp, Search, Sparkles, X } from 'lucide-react'

import { SerpPanel } from '@/components/dashboard/SerpPanel'
import { useI18n } from '@/components/providers/LocaleProvider'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useLlmConfig, type LlmClientConfig } from '@/hooks/useLlmConfig'
import { pathnameOf, useAnalytics, type TrafficByPath } from '@/hooks/useAnalytics'
import { useVirtualWindow } from '@/hooks/useVirtualWindow'
import type { UseSerpResult } from '@/hooks/serp'
import { requestSuggestion, type Suggestion } from '@/lib/llm/request'
import { CHECK_FIX_KEY, CHECK_LABEL_KEY, ISSUE_LABEL_KEY, STATUS_STYLE, scoreStyle } from '@/lib/seo/labels'
import { buildSeoReport, countReportFindings } from '@/lib/seo/report'
import { contextFromReport, scorePage } from '@/lib/seo/score'
import type { UiKey } from '@/lib/i18n'
import { cn } from '@/lib/utils'
import type { UrlRecord } from '@/types/crawl'
import type { SeoReport, SeoScore } from '@/types/seo'

/** Fixed row height; must match the virtual window's `rowHeight`. */
const ROW_HEIGHT = 44

/** Shared column template for the header and every row. */
const GRID =
  'grid grid-cols-[72px_minmax(0,1fr)_64px_64px_48px_64px_64px_72px_76px] items-center gap-2'

/** Page views at/above which a page counts as "high traffic". */
const HIGH_TRAFFIC_PAGEVIEWS = 100

/** A 0–100 score below which a high-traffic page is an opportunity. */
const LOW_SCORE = 60

/** One scored page. */
interface ScoredRow {
  record: UrlRecord
  seo: SeoScore
  /** Page views from GA4, or `undefined` when traffic was not loaded. */
  pageViews: number | undefined
  /** High traffic but a low score — the most valuable fixes. */
  opportunity: boolean
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
  const [onlyOpportunities, setOnlyOpportunities] = useState(false)
  const [sortDesc, setSortDesc] = useState(true)
  const [selected, setSelected] = useState<string | null>(null)
  const containerRef = useRef<HTMLDivElement | null>(null)

  const analytics = useAnalytics(records)
  const [llmConfig, setLlmConfig] = useLlmConfig()

  /** Site-wide report; recomputed only when the archive changes. */
  const report = useMemo(() => buildSeoReport(records), [records])
  const context = useMemo(() => contextFromReport(report), [report])

  /** Every audited page with its score and (when loaded) traffic. */
  const scored = useMemo<ScoredRow[]>(
    () =>
      records
        .filter((record) => record.seo)
        .map((record) => {
          const seo = scorePage(record, context)
          const pageViews = analytics.traffic[pathnameOf(record.url)]?.pageViews
          const opportunity =
            pageViews !== undefined && pageViews >= HIGH_TRAFFIC_PAGEVIEWS && (seo.score ?? 100) < LOW_SCORE
          return { record, seo, pageViews, opportunity }
        }),
    [records, context, analytics.traffic],
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
      opportunities: scored.filter((row) => row.opportunity).length,
      totalViews: scored.reduce((sum, row) => sum + (row.pageViews ?? 0), 0),
    }
  }, [scored, report])

  /** Rows after search / issue / opportunity filter / sorting. */
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

    const filtered = scored.filter(({ record, seo, opportunity }) => {
      if (onlyOpportunities && !opportunity) return false
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
  }, [scored, query, onlyIssues, onlyOpportunities, sortDesc, report])

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

      {/* GA4 traffic overlay */}
      <Card>
        <CardHeader className="gap-2 pb-3">
          <CardTitle className="text-base">{t('seo.ga4.title')}</CardTitle>
          <p className="text-xs text-muted-foreground">{t('seo.ga4.hint')}</p>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center gap-3">
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={analytics.load}
            disabled={analytics.status === 'loading' || analytics.paths.length === 0}
          >
            {analytics.status === 'loading' ? t('seo.ga4.loading') : t('seo.ga4.load')}
          </Button>
          <Button type="button" size="sm" variant="ghost" onClick={analytics.clear} disabled={analytics.status === 'idle'}>
            {t('seo.ga4.clear')}
          </Button>

          {analytics.status === 'done' ? (
            <span className="text-xs text-muted-foreground">
              {t('seo.ga4.loaded', { count: Object.keys(analytics.traffic).length, views: summary.totalViews.toLocaleString() })}
            </span>
          ) : null}

          {analytics.status === 'error' ? (
            <span className="text-xs text-destructive">
              {analytics.error?.code === 'no_credentials'
                ? t('seo.ga4.noCredentials')
                : t('seo.ga4.error', { message: analytics.error?.message ?? '' })}
            </span>
          ) : null}

          {analytics.status === 'done' ? (
            <Badge variant="outline" className="ml-auto border-amber-500/40 text-amber-700 dark:text-amber-300">
              {t('seo.opportunities')} {summary.opportunities.toLocaleString()}
            </Badge>
          ) : null}
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

              <Label className="flex items-center gap-2 text-xs text-muted-foreground">
                <Switch checked={onlyOpportunities} onCheckedChange={setOnlyOpportunities} />
                {t('seo.highTrafficLowScore')}
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
            {(
              [
                'seo.col.score',
                'seo.col.url',
                'seo.col.titleLength',
                'seo.col.descLength',
                'seo.col.h1',
                'seo.col.imagesMissingAlt',
                'seo.col.wordCount',
                'seo.col.traffic',
                'seo.col.indexable',
              ] as UiKey[]
            ).map((column, index) => (
              <span key={column} className={index >= 2 && index <= 7 ? 'text-right' : undefined}>
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
                  {visible.map(({ record, seo, pageViews, opportunity }) => (
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
                      <span className="flex items-center justify-end gap-1 text-right tabular-nums text-muted-foreground">
                        {opportunity ? (
                          <span
                            className="size-1.5 shrink-0 rounded-full bg-amber-500"
                            title={t('seo.highTrafficLowScore')}
                          />
                        ) : null}
                        {pageViews === undefined ? '—' : pageViews.toLocaleString()}
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
      {selectedRow ? (
        <SeoDetail
          row={selectedRow}
          traffic={analytics.traffic}
          llmConfig={llmConfig}
          onLlmConfigChange={setLlmConfig}
          onClose={() => setSelected(null)}
        />
      ) : null}
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

/** Per-page detail: extracted values, every check with its fix hint, and AI suggestions. */
function SeoDetail({
  row,
  traffic,
  llmConfig,
  onLlmConfigChange,
  onClose,
}: {
  row: ScoredRow
  traffic: TrafficByPath
  llmConfig: LlmClientConfig
  onLlmConfigChange: (patch: Partial<LlmClientConfig>) => void
  onClose: () => void
}) {
  const { t, locale } = useI18n()
  const { record, seo } = row
  const snapshot = record.seo
  const trafficEntry = traffic[pathnameOf(record.url)]

  /** Extracted fields worth showing, in a stable order. */
  const facts: Array<{ label: string; value: string }> = snapshot
    ? [
        { label: 'title', value: snapshot.title ?? '—' },
        { label: 'description', value: snapshot.metaDescription ?? '—' },
        { label: 'canonical', value: snapshot.canonical ?? '—' },
        { label: 'robots', value: snapshot.metaRobots ?? '—' },
        { label: 'lang', value: snapshot.lang ?? '—' },
        { label: 'h1', value: snapshot.h1.length ? snapshot.h1.join(' | ') : '—' },
        { label: t('seo.fact.links'), value: `${snapshot.links.internal} / ${snapshot.links.external} / ${snapshot.links.nofollow}` },
        { label: 'structuredData', value: snapshot.structuredData.join(', ') || '—' },
        {
          label: t('seo.fact.keywords'),
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
          {trafficEntry ? (
            <Badge variant="outline" className="gap-1 text-[10px]">
              {t('seo.col.traffic')} {trafficEntry.pageViews.toLocaleString()}
            </Badge>
          ) : null}
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
          <p className="text-[10px] leading-snug text-muted-foreground">{t('seo.checksValueHint')}</p>
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

        {/* AI rewrite suggestions */}
        <AiSuggest
          record={record}
          seo={seo}
          language={locale}
          config={llmConfig}
          onConfigChange={onLlmConfigChange}
        />
      </CardContent>
    </Card>
  )
}

/** The per-page AI suggestion block. */
function AiSuggest({
  record,
  seo,
  language,
  config,
  onConfigChange,
}: {
  record: UrlRecord
  seo: SeoScore
  language: string
  config: LlmClientConfig
  onConfigChange: (patch: Partial<LlmClientConfig>) => void
}) {
  const { t } = useI18n()
  const [status, setStatus] = useState<'idle' | 'loading' | 'done' | 'error'>('idle')
  const [result, setResult] = useState<Suggestion | null>(null)
  const [error, setError] = useState<string | null>(null)
  const abortRef = useRef<AbortController | null>(null)

  const snapshot = record.seo

  const generate = () => {
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller
    setStatus('loading')
    setError(null)

    const issues = seo.checks
      .filter((check) => check.status === 'fail' || check.status === 'warn')
      .map((check) => t(CHECK_LABEL_KEY[check.id]))

    void requestSuggestion(
      {
        url: record.url,
        language,
        title: snapshot?.title ?? null,
        description: snapshot?.metaDescription ?? null,
        h1: snapshot?.h1 ?? [],
        wordCount: snapshot?.wordCount ?? 0,
        issues,
        keywords: snapshot?.keywords.map((keyword) => keyword.term) ?? [],
        baseUrl: config.baseUrl || undefined,
        model: config.model || undefined,
      },
      controller.signal,
    )
      .then((response) => {
        if (response.ok) {
          setResult(response.suggestion)
          setStatus('done')
        } else {
          setError(response.message)
          setStatus('error')
        }
      })
      .catch(() => undefined)
  }

  return (
    <div className="flex flex-col gap-2 rounded-lg border bg-muted/20 p-3 lg:col-span-2">
      <div className="flex flex-wrap items-center gap-2">
        <p className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
          <Sparkles className="size-3.5" />
          {t('seo.ai.title')}
        </p>
        <Button type="button" size="sm" className="ml-auto h-7 text-xs" onClick={generate} disabled={status === 'loading'}>
          {status === 'loading'
            ? t('seo.ai.working')
            : result
              ? t('seo.ai.regenerate')
              : t('seo.ai.generate')}
        </Button>
      </div>

      {/* Endpoint settings (key stays on the server) */}
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1">
          <span className="text-[11px] font-medium text-muted-foreground">{t('seo.ai.baseUrl')}</span>
          <Input
            name="llm-base-url"
            value={config.baseUrl}
            onChange={(event) => onConfigChange({ baseUrl: event.target.value })}
            placeholder={t('seo.ai.baseUrlPlaceholder')}
            spellCheck={false}
            className="h-7 w-64 font-mono text-xs"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[11px] font-medium text-muted-foreground">{t('seo.ai.model')}</span>
          <Input
            name="llm-model"
            value={config.model}
            onChange={(event) => onConfigChange({ model: event.target.value })}
            placeholder={t('seo.ai.modelPlaceholder')}
            spellCheck={false}
            className="h-7 w-44 font-mono text-xs"
          />
        </label>
      </div>
      <p className="text-[10px] text-muted-foreground">{t('seo.ai.hint')}</p>

      {status === 'error' ? (
        <p className="text-xs text-destructive">
          {error === 'no_config' || error === ''
            ? t('seo.ai.noConfig')
            : t('seo.ai.error', { message: error ?? '' })}
        </p>
      ) : null}

      {result ? (
        <div className="flex flex-col gap-1.5 text-xs">
          <div className="flex gap-2">
            <span className="w-28 shrink-0 text-muted-foreground">{t('seo.ai.resultTitle')}</span>
            <span className="min-w-0 break-words">
              {result.title || '—'}
              <span className="ml-1 tabular-nums text-muted-foreground">({result.title.length})</span>
            </span>
          </div>
          <div className="flex gap-2">
            <span className="w-28 shrink-0 text-muted-foreground">{t('seo.ai.resultDescription')}</span>
            <span className="min-w-0 break-words">
              {result.description || '—'}
              <span className="ml-1 tabular-nums text-muted-foreground">({result.description.length})</span>
            </span>
          </div>
          {result.notes.length > 0 ? (
            <div className="flex gap-2">
              <span className="w-28 shrink-0 text-muted-foreground">{t('seo.ai.notes')}</span>
              <ul className="min-w-0 list-disc pl-4">
                {result.notes.map((note, index) => (
                  <li key={index}>{note}</li>
                ))}
              </ul>
            </div>
          ) : null}
          {result.model ? <p className="text-[10px] text-muted-foreground">{result.model}</p> : null}
        </div>
      ) : null}
    </div>
  )
}