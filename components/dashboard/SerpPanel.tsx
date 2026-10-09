/**
 * SERP workspace: derive queries from the crawl, check rankings and compare the top
 * competitors' on-page basics.
 *
 * Reading search pages is opt-in and can be blocked, so the panel leads with the
 * warning, spaces queries out, and surfaces a blocked run as a resumable pause.
 *
 * SERP 工作區：從抓取結果推導查詢、檢查排名，並比較前段競品的單頁基本資料。
 * 讀取搜尋頁屬選用且可能被封鎖，因此面板先顯示警告、查詢之間固定間隔，
 * 並把被封鎖的執行呈現為可續跑的暫停狀態。
 */
'use client'

import { useState, type ReactNode } from 'react'
import { AlertTriangle, Play, RotateCcw, Square, Trash2 } from 'lucide-react'

import { useI18n } from '@/components/providers/LocaleProvider'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
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
import type { UseSerpResult } from '@/hooks/serp'
import type { UiKey } from '@/lib/i18n'
import { cn } from '@/lib/utils'
import type { UrlRecord } from '@/types/crawl'
import {
  SERP_MAX_ANALYZE_TOP,
  SERP_MAX_QUERIES,
  SERP_MIN_INTERVAL_MS,
  type SerpErrorCode,
  type SerpRecord,
  type SerpStatus,
} from '@/types/serp'

/** Status → i18n key. */
const STATUS_KEY: Record<SerpStatus, UiKey> = {
  idle: 'serp.status.idle',
  running: 'serp.status.running',
  paused: 'serp.status.paused',
  stopped: 'serp.status.stopped',
  done: 'serp.status.done',
}

/** Status → badge styling. */
const STATUS_STYLE: Record<SerpStatus, string> = {
  idle: 'border-muted-foreground/30 text-muted-foreground',
  running: 'border-sky-500/40 text-sky-700 dark:text-sky-300',
  paused: 'border-amber-500/40 text-amber-700 dark:text-amber-300',
  stopped: 'border-muted-foreground/30 text-muted-foreground',
  done: 'border-emerald-500/40 text-emerald-700 dark:text-emerald-300',
}

/** Error code → i18n key for the fatal banner. */
const FATAL_KEY: Record<SerpErrorCode, UiKey> = {
  blocked: 'serp.fatal.blocked',
  empty: 'serp.fatal.empty',
  no_key: 'serp.fatal.noKey',
  network: 'serp.fatal.network',
  invalid: 'serp.fatal.invalid',
}

/** Rank → badge styling. */
function rankStyle(rank: number | null): string {
  if (rank === null) return 'border-destructive/40 text-destructive'
  if (rank <= 3) return 'border-emerald-500/40 text-emerald-700 dark:text-emerald-300'
  if (rank <= 10) return 'border-amber-500/40 text-amber-700 dark:text-amber-300'
  return 'border-muted-foreground/40 text-muted-foreground'
}

interface SerpPanelProps {
  /** The crawl archive; audited pages become queries. */
  records: UrlRecord[]
  /** The SERP workspace from `useSerp()`. */
  serp: UseSerpResult
}

/** The SERP view. */
export function SerpPanel({ records, serp }: SerpPanelProps) {
  const { t } = useI18n()
  const [selected, setSelected] = useState<string | null>(null)

  const audited = records.filter((record) => record.seo).length
  const { status, queries, results, completed, current, failures, fatal, options } = serp

  if (audited === 0) {
    return (
      <Card>
        <CardContent className="flex h-[240px] flex-col items-center justify-center gap-1 text-sm text-muted-foreground">
          {t('serp.empty')}
          <span className="text-xs">{t('serp.emptyHint')}</span>
        </CardContent>
      </Card>
    )
  }

  const running = status === 'running'
  const selectedRecord = selected ? results[selected] : undefined

  return (
    <div className="flex flex-col gap-3">
      {/* Config + disclaimer */}
      <Card>
        <CardHeader className="gap-2 pb-3">
          <CardTitle className="text-base">{t('serp.title')}</CardTitle>
          <p className="text-xs text-muted-foreground">{t('serp.disclaimer')}</p>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <div className="flex flex-wrap items-end gap-3">
            <Field label={t('serp.engine')}>
              <Select
                value={options.engine}
                onValueChange={(value) => serp.setOptions({ engine: value as typeof options.engine })}
              >
                <SelectTrigger size="sm" className="w-40">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="google">{t('serp.engine.google')}</SelectItem>
                  <SelectItem value="bing">{t('serp.engine.bing')}</SelectItem>
                </SelectContent>
              </Select>
            </Field>

            <Field label={t('serp.provider')}>
              <Select
                value={options.provider}
                onValueChange={(value) => serp.setOptions({ provider: value as typeof options.provider })}
              >
                <SelectTrigger size="sm" className="w-52">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="auto">{t('serp.provider.auto')}</SelectItem>
                  <SelectItem value="playwright">{t('serp.provider.playwright')}</SelectItem>
                  <SelectItem value="serpapi">{t('serp.provider.serpapi')}</SelectItem>
                </SelectContent>
              </Select>
            </Field>

            <Field label={t('serp.maxQueries')}>
              <Input
                name="serp-max-queries"
                type="number"
                min={1}
                max={SERP_MAX_QUERIES}
                value={options.maxQueries}
                onChange={(event) => serp.setOptions({ maxQueries: Number(event.target.value) })}
                className="h-8 w-20 text-xs"
              />
            </Field>

            <Field label={t('serp.analyzeTop')} hint={t('serp.analyzeTopHint')}>
              <Input
                name="serp-analyze-top"
                type="number"
                min={0}
                max={SERP_MAX_ANALYZE_TOP}
                value={options.analyzeTop}
                onChange={(event) => serp.setOptions({ analyzeTop: Number(event.target.value) })}
                className="h-8 w-20 text-xs"
              />
            </Field>

            <Field label={t('serp.minInterval')}>
              <span className="text-xs tabular-nums text-muted-foreground">
                {Math.round(SERP_MIN_INTERVAL_MS / 1000)}
                {t('serp.minIntervalUnit')}
              </span>
            </Field>
          </div>

          <p className="text-[11px] text-muted-foreground">
            {t('serp.costWarning', { n: options.analyzeTop })} {t('serp.notAuditedHint')}
          </p>

          <div className="flex flex-wrap items-center gap-2">
            {running ? (
              <Button type="button" size="sm" variant="outline" onClick={serp.pause}>
                <Square className="mr-1 size-3.5" />
                {t('serp.pause')}
              </Button>
            ) : (
              <Button
                type="button"
                size="sm"
                onClick={status === 'paused' || status === 'stopped' ? serp.resume : serp.start}
                disabled={queries.length === 0}
              >
                <Play className="mr-1 size-3.5" />
                {status === 'paused' || status === 'stopped' ? t('serp.resume') : t('serp.start')}
              </Button>
            )}

            <Button type="button" size="sm" variant="ghost" onClick={serp.stop} disabled={!running}>
              <RotateCcw className="mr-1 size-3.5" />
              {t('serp.stop')}
            </Button>

            <Button type="button" size="sm" variant="ghost" onClick={serp.clear}>
              <Trash2 className="mr-1 size-3.5" />
              {t('serp.clear')}
            </Button>

            <Badge variant="outline" className={cn('ml-auto', STATUS_STYLE[status])}>
              {t(STATUS_KEY[status])}
            </Badge>
            <span className="text-xs tabular-nums text-muted-foreground">
              {t('serp.progress', { done: completed, total: queries.length })}
            </span>
          </div>

          {current ? (
            <p className="truncate text-xs text-sky-700 dark:text-sky-300">
              {t('serp.current', { query: current.query })}
            </p>
          ) : null}
        </CardContent>
      </Card>

      {/* Fatal banner */}
      {fatal ? (
        <Alert variant="destructive">
          <AlertTriangle className="size-4" />
          <AlertTitle>{t('serp.fatal.title')}</AlertTitle>
          <AlertDescription>
            {t(FATAL_KEY[fatal.code])}
            <span className="mt-1 block font-mono text-[11px] opacity-70">{fatal.message}</span>
          </AlertDescription>
        </Alert>
      ) : null}

      {/* Recoverable failures */}
      {failures.length > 0 ? (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">{t('serp.failuresTitle')}</CardTitle>
          </CardHeader>
          <CardContent className="flex max-h-40 flex-col gap-1 overflow-y-auto text-xs">
            {failures.map((failure, index) => (
              <div key={`${failure.url}-${index}`} className="flex gap-2">
                <span className="w-16 shrink-0 font-mono text-muted-foreground">{failure.code}</span>
                <span className="min-w-0 truncate" title={failure.query}>
                  {failure.query}
                </span>
                <span className="min-w-0 flex-1 truncate text-muted-foreground" title={failure.message}>
                  {failure.message}
                </span>
              </div>
            ))}
          </CardContent>
        </Card>
      ) : null}

      {/* Results table */}
      <Card className="min-w-0">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">{t('serp.resultsTitle')}</CardTitle>
        </CardHeader>
        <CardContent className="px-3">
          <div className="max-h-[420px] overflow-y-auto rounded-md border">
            {queries.map((entry) => {
              const record = results[entry.url]
              return (
                <button
                  key={entry.url}
                  type="button"
                  onClick={() => setSelected(record ? entry.url : null)}
                  disabled={!record}
                  className={cn(
                    'grid w-full grid-cols-[minmax(0,1.4fr)_72px_minmax(0,1fr)_80px] items-center gap-2 border-b px-3 py-2 text-left text-xs last:border-b-0 hover:bg-muted/40 disabled:opacity-50',
                    selected === entry.url && 'bg-muted/60',
                  )}
                  title={entry.url}
                >
                  <span className="truncate">{entry.query}</span>
                  <span>
                    <Badge variant="outline" className={cn('px-1.5 py-0 text-[10px]', record ? rankStyle(record.rank) : '')}>
                      {record
                        ? record.rank === null
                          ? t('serp.rank.none')
                          : t('serp.rank.value', { rank: record.rank })
                        : '—'}
                    </Badge>
                  </span>
                  <span className="truncate font-mono text-[11px] text-muted-foreground">
                    {record?.results[0]?.hostname ?? '—'}
                  </span>
                  <span className="text-right tabular-nums text-muted-foreground">
                    {record ? record.competitors.length : '—'}
                  </span>
                </button>
              )
            })}
          </div>
        </CardContent>
      </Card>

      {/* Detail */}
      {selected && selectedRecord ? (
        <SerpDetail url={selected} record={selectedRecord} onClose={() => setSelected(null)} />
      ) : null}
    </div>
  )
}

/** A labelled control. */
function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[11px] font-medium text-muted-foreground" title={hint}>
        {label}
      </span>
      {children}
    </label>
  )
}

/** Detail for one query: top results and the competitor comparison. */
function SerpDetail({ url, record, onClose }: { url: string; record: SerpRecord; onClose: () => void }) {
  const { t } = useI18n()

  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between gap-2 pb-3">
        <div className="min-w-0">
          <CardTitle className="text-base">{t('serp.detailsTitle')}</CardTitle>
          <p className="mt-1 break-all text-xs text-muted-foreground">
            <span className="font-medium">{t('serp.col.query')}: </span>
            {record.query}
          </p>
          <p className="mt-0.5 break-all font-mono text-[11px] text-muted-foreground">{url}</p>
        </div>
        <Button type="button" variant="ghost" size="sm" onClick={onClose}>
          {t('urls.clearFilters')}
        </Button>
      </CardHeader>

      <CardContent className="grid gap-4 lg:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <p className="text-xs font-medium text-muted-foreground">{t('serp.topResults')}</p>
          {record.results.slice(0, 10).map((result) => (
            <div key={result.url} className="flex items-start gap-2 text-xs">
              <span className="mt-0.5 w-6 shrink-0 text-right tabular-nums text-muted-foreground">
                {result.position}
              </span>
              <span className="min-w-0">
                <a
                  href={result.url}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="block truncate text-foreground hover:underline"
                  title={result.url}
                >
                  {result.title || result.hostname}
                </a>
                <span className="block truncate font-mono text-[10px] text-muted-foreground">{result.hostname}</span>
              </span>
            </div>
          ))}
        </div>

        <div className="flex flex-col gap-1.5">
          <p className="text-xs font-medium text-muted-foreground">{t('serp.competitorTitle')}</p>
          {record.competitors.length === 0 ? (
            <p className="text-xs text-muted-foreground">—</p>
          ) : (
            record.competitors.map((competitor) => (
              <div key={competitor.url} className="rounded-md border bg-muted/20 px-2 py-1.5 text-xs">
                <a
                  href={competitor.url}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="block truncate font-mono text-[11px] hover:underline"
                  title={competitor.url}
                >
                  {competitor.url}
                </a>
                {competitor.error ? (
                  <p className="mt-0.5 text-destructive">
                    {t('serp.competitor.error')}: {competitor.error}
                  </p>
                ) : (
                  <p className="mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5 text-muted-foreground">
                    <span>
                      {t('serp.competitor.titleLength')}: <span className="tabular-nums">{competitor.titleLength}</span>
                    </span>
                    <span>
                      {t('serp.competitor.descriptionLength')}:{' '}
                      <span className="tabular-nums">{competitor.descriptionLength}</span>
                    </span>
                    <span>
                      {t('serp.competitor.h1')}: <span className="tabular-nums">{competitor.h1Count}</span>
                    </span>
                    <span>
                      {t('serp.competitor.words')}: <span className="tabular-nums">{competitor.wordCount}</span>
                    </span>
                    <span>
                      {t('serp.competitor.structured')}:{' '}
                      {competitor.structuredData.join(', ') || '—'}
                    </span>
                  </p>
                )}
              </div>
            ))
          )}
        </div>
      </CardContent>
    </Card>
  )
}