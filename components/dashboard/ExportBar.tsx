/**
 * Export bar: download buttons plus the field, strategy and URL-shaping switches.
 *
 * Every export option lives here rather than in the control panel because these
 * switches only affect the generated files. They are stored in the shared crawl
 * options, so the choices survive a refresh together with the task snapshot.
 *
 * 匯出列：下載按鈕與欄位／策略／URL 呈現開關。
 * 這些開關只影響產出的檔案，因此放在這裡而非控制面板；
 * 它們存放在共用的抓取選項中，會隨任務快照一起保留。
 */
'use client'

import { useState } from 'react'
import { Download, FileCode2, FileJson, FileSpreadsheet, TriangleAlert } from 'lucide-react'
import { motion } from 'motion/react'

import { useI18n } from '@/components/providers/LocaleProvider'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { buildCsv, buildJson, downloadFile, downloadFiles } from '@/lib/export'
import { parseHostOverride } from '@/lib/sitemap'
import {
  CHANGEFREQ_OPTIONS,
  DEFAULT_MAX_URLS_PER_FILE,
  SITEMAP_MAX_URLS,
  buildSitemapXml,
  splitSitemaps,
  toDownloadPayloads,
  toSitemapEntries,
} from '@/lib/sitemap'
import type { SitemapExportOptions } from '@/lib/sitemap/entries'
import type { UiKey } from '@/lib/i18n'
import { cn } from '@/lib/utils'
import type { ChangefreqSetting, CrawlOptions, CrawlTaskMeta, PriorityStrategy, UrlRecord } from '@/types/crawl'
import type { SerpRecord } from '@/types/serp'

/** Priority strategy dropdown options. */
const PRIORITY_STRATEGIES: Array<{ value: PriorityStrategy; label: UiKey }> = [
  { value: 'linkDepth', label: 'export.priorityStrategy.linkDepth' },
  { value: 'pathDepth', label: 'export.priorityStrategy.pathDepth' },
  { value: 'relativePathDepth', label: 'export.priorityStrategy.relativePathDepth' },
]

interface ExportBarProps {
  /** Archive to export (already filtered by the caller when `excludeFailed` is on). */
  records: UrlRecord[]
  /** Shared crawl options; the switches write into it. */
  options: CrawlOptions
  /** Merge option patches back into the crawl options. */
  onOptionsChange: (patch: Partial<CrawlOptions>) => void
  /** Task metadata embedded in the JSON export and used for the path prefix. */
  task: CrawlTaskMeta | null
  /** Public origin used for `<loc>` values inside sitemapindex.xml. */
  baseUrl: string
  /** SERP records keyed by page URL, embedded in the CSV/JSON exports. */
  serp?: Readonly<Record<string, SerpRecord>>
}

/** Short-lived confirmation shown next to the buttons. */
interface ExportFeedback {
  kind: 'done' | 'error'
  /** Already-translated text (kept as a string so it can animate by key). */
  message: string
}

/** Export bar with every download format and option. */
export function ExportBar({ records, options, onOptionsChange, task, baseUrl, serp = {} }: ExportBarProps) {
  const { t } = useI18n()
  const [feedback, setFeedback] = useState<ExportFeedback | null>(null)
  const hasData = records.length > 0

  /** Flash a confirmation for roughly 2.4 seconds. */
  const report = (message: string, kind: 'done' | 'error' = 'done') => {
    setFeedback({ kind, message })
    window.setTimeout(() => setFeedback(null), 2400)
  }

  /**
   * Build the exporter context.
   *
   * `pathPrefix` comes from the task, everything else from the crawl options — the
   * three exporters therefore always agree on URL shaping and priority.
   */
  const exportOptions: SitemapExportOptions = {
    includeLastmod: options.includeLastmod,
    includePriority: options.includePriority,
    priorityStrategy: options.priorityStrategy,
    includeChangefreq: options.includeChangefreq,
    changefreq: options.changefreq,
    readableUrls: options.readableUrls,
    useFinalUrl: options.useFinalUrl,
    hostOverride: options.exportHostOverride,
    pathPrefix: task?.pathPrefix ?? '',
  }

  /**
   * Export `sitemap.xml`, optionally split into several files.
   *
   * A split produces N sitemaps plus a `sitemapindex.xml`; they are delivered as a
   * single ZIP because browsers refuse repeated programmatic downloads.
   */
  const handleExportXml = async () => {
    const entries = toSitemapEntries(records, exportOptions)

    if (!options.splitSitemaps) {
      downloadFile('sitemap.xml', buildSitemapXml(entries), 'application/xml')
      report(t('export.done.xml', { count: entries.length }))
      return
    }

    const result = splitSitemaps(entries, options.maxUrlsPerFile, baseUrl)
    const mode = await downloadFiles(toDownloadPayloads(result), 'sitemap-files.zip')

    if (result.split) {
      report(
        `${t(mode === 'zip' ? 'export.done.splitZip' : 'export.done.splitSequential', {
          files: result.files.length,
        })}${result.overProtocolLimit ? ` · ${t('export.done.overLimit')}` : ''}`,
      )
    } else {
      report(t('export.done.noSplit', { count: entries.length }))
    }
  }

  /** Export the CSV inventory. */
  const handleExportCsv = () => {
    try {
      downloadFile('sitemap.csv', buildCsv(records, exportOptions, serp), 'text/csv')
      report(t('export.done.csv', { count: records.length }))
    } catch (error) {
      report(`${t('export.failed')}: ${error instanceof Error ? error.message : String(error)}`, 'error')
    }
  }

  /** Export the full JSON inventory. */
  const handleExportJson = () => {
    try {
      downloadFile('sitemap.json', buildJson(records, task, exportOptions, serp), 'application/json')
      report(t('export.done.json'))
    } catch (error) {
      report(`${t('export.failed')}: ${error instanceof Error ? error.message : String(error)}`, 'error')
    }
  }

  const failedCount = records.filter((record) => record.status === 'failed').length
  const hostOverride = parseHostOverride(options.exportHostOverride)
  const hostInvalid = options.exportHostOverride.trim() !== '' && hostOverride === null

  return (
    <Card className="sticky bottom-2 z-10 py-3 shadow-md backdrop-blur-md supports-[backdrop-filter]:bg-background/85">
      <CardContent className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <Button onClick={handleExportXml} disabled={!hasData}>
              <Download className="size-4" />
              {t('export.sitemapXml')}
            </Button>
            <Button variant="outline" onClick={handleExportCsv} disabled={!hasData}>
              <FileSpreadsheet className="size-4" />
              {t('export.csv')}
            </Button>
            <Button variant="outline" onClick={handleExportJson} disabled={!hasData}>
              <FileJson className="size-4" />
              {t('export.json')}
            </Button>

            <span className="flex items-center gap-1 text-xs text-muted-foreground">
              <FileCode2 className="size-3.5" />
              {t('export.count', { count: records.length.toLocaleString() })}
            </span>

            {feedback ? (
              <motion.span
                key={feedback.message}
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                className={cn(
                  'text-xs',
                  feedback.kind === 'done'
                    ? 'text-emerald-600 dark:text-emerald-400'
                    : 'text-destructive',
                )}
              >
                {feedback.message}
              </motion.span>
            ) : null}
          </div>

          {failedCount > 0 ? (
            <span className="flex items-center gap-1 text-xs text-amber-600 dark:text-amber-400">
              <TriangleAlert className="size-3.5" />
              {t('export.failedWarning', { count: failedCount })}
            </span>
          ) : null}
        </div>

        {/* Optional sitemap fields, priority strategy, filtering and splitting */}
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2 rounded-lg border bg-muted/30 px-3 py-2 text-xs">
          <span className="font-medium text-muted-foreground">{t('export.optionsTitle')}</span>

          <label className="flex items-center gap-2">
            <Switch
              checked={options.excludeFailed}
              onCheckedChange={(checked) => onOptionsChange({ excludeFailed: checked })}
            />
            <span className="text-muted-foreground">{t('export.excludeFailed')}</span>
          </label>

          <label className="flex items-center gap-2" title={t('export.excludeRedirectedHint')}>
            <Switch
              checked={options.excludeRedirected}
              onCheckedChange={(checked) => onOptionsChange({ excludeRedirected: checked })}
            />
            <span className="text-muted-foreground">{t('export.excludeRedirected')}</span>
          </label>

          <label className="flex items-center gap-2" title={t('export.lastmodHint')}>
            <Switch
              checked={options.includeLastmod}
              onCheckedChange={(checked) => onOptionsChange({ includeLastmod: checked })}
            />
            <span className="text-muted-foreground">{t('export.lastmod')}</span>
          </label>

          <label className="flex items-center gap-2" title={t('export.priorityHint')}>
            <Switch
              checked={options.includePriority}
              onCheckedChange={(checked) => onOptionsChange({ includePriority: checked })}
            />
            <span className="text-muted-foreground">{t('export.priority')}</span>
          </label>

          {options.includePriority ? (
            <Select
              name="priorityStrategy"
              value={options.priorityStrategy}
              onValueChange={(value) =>
                onOptionsChange({ priorityStrategy: value as PriorityStrategy })
              }
            >
              <SelectTrigger
                size="sm"
                className="h-7 w-44 text-xs"
                aria-label={t('export.priority')}
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PRIORITY_STRATEGIES.map((item) => (
                  <SelectItem key={item.value} value={item.value} className="text-xs">
                    {t(item.label)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : null}

          <label className="flex items-center gap-2">
            <Switch
              checked={options.includeChangefreq}
              onCheckedChange={(checked) => onOptionsChange({ includeChangefreq: checked })}
            />
            <span className="text-muted-foreground">{t('export.changefreq')}</span>
          </label>

          {options.includeChangefreq ? (
            <Select
              name="changefreq"
              value={options.changefreq}
              onValueChange={(value) =>
                onOptionsChange({ changefreq: value as ChangefreqSetting })
              }
            >
              <SelectTrigger size="sm" className="h-7 w-32 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CHANGEFREQ_OPTIONS.map((item) => (
                  <SelectItem key={item.value} value={item.value} className="text-xs">
                    {item.value === 'auto' ? t('changefreq.auto') : item.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : null}

          <label className="flex items-center gap-2" title={t('export.readableUrlsHint')}>
            <Switch
              checked={options.readableUrls}
              onCheckedChange={(checked) => onOptionsChange({ readableUrls: checked })}
            />
            <span className="text-muted-foreground">{t('export.readableUrls')}</span>
          </label>

          <label className="flex items-center gap-2" title={t('export.useFinalUrlHint')}>
            <Switch
              checked={options.useFinalUrl}
              onCheckedChange={(checked) => onOptionsChange({ useFinalUrl: checked })}
            />
            <span className="text-muted-foreground">{t('export.useFinalUrl')}</span>
          </label>

          <span className="flex flex-wrap items-center gap-2 border-l pl-4">
            <label className="flex items-center gap-2" title={t('export.splitHint')}>
              <Switch
                checked={options.splitSitemaps}
                onCheckedChange={(checked) => onOptionsChange({ splitSitemaps: checked })}
              />
              <span className="text-muted-foreground">{t('export.split')}</span>
            </label>

            {options.splitSitemaps ? (
              <label className="flex items-center gap-2">
                <span className="text-muted-foreground">{t('export.perFile')}</span>
                <Input
                  name="maxUrlsPerFile"
                  type="number"
                  min={1}
                  max={SITEMAP_MAX_URLS}
                  value={options.maxUrlsPerFile}
                  onChange={(event) =>
                    onOptionsChange({
                      maxUrlsPerFile: Math.max(
                        1,
                        Math.min(
                          SITEMAP_MAX_URLS,
                          Number(event.target.value) || DEFAULT_MAX_URLS_PER_FILE,
                        ),
                      ),
                    })
                  }
                  className="h-7 w-24 text-xs tabular-nums"
                />
                <span className="text-muted-foreground">{t('export.perFileUnit')}</span>
              </label>
            ) : null}
          </span>

          <label className="flex flex-wrap items-center gap-2 border-l pl-4">
            <span className="text-muted-foreground" title={t('export.hostOverrideHint')}>
              {t('export.hostOverride')}
            </span>
            <Input
              name="exportHostOverride"
              value={options.exportHostOverride}
              onChange={(event) => onOptionsChange({ exportHostOverride: event.target.value })}
              placeholder={t('export.hostOverridePlaceholder')}
              spellCheck={false}
              className={cn(
                'h-7 w-56 font-mono text-xs',
                hostInvalid && 'border-destructive text-destructive',
              )}
            />
          </label>
        </div>
      </CardContent>
    </Card>
  )
}