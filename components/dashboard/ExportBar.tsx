/**
 * Export bar: download buttons plus the optional-field and splitting switches.
 *
 * Every export option lives here rather than in the control panel because these
 * switches only affect the generated files. They are stored in the shared crawl
 * options, so the choices survive a refresh together with the task snapshot.
 *
 * 匯出列：下載按鈕與選用欄位／拆分開關。
 * 這些開關只影響產出的檔案，因此放在這裡而非控制面板；
 * 它們存放在共用的抓取選項中，會隨任務快照一起保留。
 */
'use client'

import { useState } from 'react'
import { Download, FileCode2, FileJson, FileSpreadsheet, TriangleAlert } from 'lucide-react'
import { motion } from 'motion/react'

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
import {
  CHANGEFREQ_OPTIONS,
  DEFAULT_MAX_URLS_PER_FILE,
  SITEMAP_MAX_URLS,
  buildSitemapXml,
  splitSitemaps,
  toDownloadPayloads,
  toSitemapEntries,
} from '@/lib/sitemap'
import { cn } from '@/lib/utils'
import type { ChangefreqSetting, CrawlOptions, CrawlTaskMeta, UrlRecord } from '@/types/crawl'

interface ExportBarProps {
  /** Archive to export (already filtered by the caller when `excludeFailed` is on). */
  records: UrlRecord[]
  /** Shared crawl options; the switches write into it. */
  options: CrawlOptions
  /** Merge option patches back into the crawl options. */
  onOptionsChange: (patch: Partial<CrawlOptions>) => void
  /** Task metadata embedded in the JSON export. */
  task: CrawlTaskMeta | null
  /** Public origin used for `<loc>` values inside sitemapindex.xml. */
  baseUrl: string
}

/** Short-lived confirmation shown next to the buttons. */
interface ExportFeedback {
  kind: 'done' | 'error'
  message: string
}

/** Export bar with every download format and switch. */
export function ExportBar({ records, options, onOptionsChange, task, baseUrl }: ExportBarProps) {
  const [feedback, setFeedback] = useState<ExportFeedback | null>(null)
  const hasData = records.length > 0

  /** Flash a confirmation for roughly 2.4 seconds. */
  const report = (message: string, kind: 'done' | 'error' = 'done') => {
    setFeedback({ kind, message })
    window.setTimeout(() => setFeedback(null), 2400)
  }

  /**
   * Export `sitemap.xml`, optionally split into several files.
   *
   * A split produces N sitemaps plus a `sitemapindex.xml`; they are delivered as a
   * single ZIP because browsers refuse repeated programmatic downloads.
   */
  const handleExportXml = async () => {
    const entries = toSitemapEntries(records, options)

    if (!options.splitSitemaps) {
      downloadFile('sitemap.xml', buildSitemapXml(entries), 'application/xml')
      report(`已导出 sitemap.xml（${entries.length} 条）`)
      return
    }

    const result = splitSitemaps(entries, options.maxUrlsPerFile, baseUrl)
    const mode = await downloadFiles(toDownloadPayloads(result), 'sitemap-files.zip')

    if (result.split) {
      report(
        `已拆分为 ${result.files.length} 个 sitemap${
          mode === 'zip' ? '并打包为 ZIP' : '（逐个下载）'
        }${result.overProtocolLimit ? '，超出协议上限，请再缩小每文件条数' : ''}`,
      )
    } else {
      report(`共 ${entries.length} 条，未超过每文件上限，已导出单个 sitemap.xml`)
    }
  }

  /** Export the CSV inventory. */
  const handleExportCsv = () => {
    try {
      downloadFile('sitemap.csv', buildCsv(records), 'text/csv')
      report(`已导出 sitemap.csv（${records.length} 行）`)
    } catch (error) {
      report(error instanceof Error ? error.message : '导出 CSV 失败', 'error')
    }
  }

  /** Export the full JSON inventory. */
  const handleExportJson = () => {
    try {
      downloadFile('sitemap.json', buildJson(records, task), 'application/json')
      report('已导出 sitemap.json')
    } catch (error) {
      report(error instanceof Error ? error.message : '导出 JSON 失败', 'error')
    }
  }

  const failedCount = records.filter((record) => record.status === 'failed').length

  return (
    <Card className="sticky bottom-2 z-10 py-3 shadow-md backdrop-blur-md supports-[backdrop-filter]:bg-background/85">
      <CardContent className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <Button onClick={handleExportXml} disabled={!hasData}>
              <Download className="size-4" />
              导出 sitemap.xml
            </Button>
            <Button variant="outline" onClick={handleExportCsv} disabled={!hasData}>
              <FileSpreadsheet className="size-4" />
              CSV
            </Button>
            <Button variant="outline" onClick={handleExportJson} disabled={!hasData}>
              <FileJson className="size-4" />
              JSON
            </Button>

            <span className="flex items-center gap-1 text-xs text-muted-foreground">
              <FileCode2 className="size-3.5" />
              将导出 {records.length.toLocaleString()} 条
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
              含 {failedCount} 个失败页面
            </span>
          ) : null}
        </div>

        {/* Optional sitemap fields, filtering and splitting */}
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2 rounded-lg border bg-muted/30 px-3 py-2 text-xs">
          <span className="font-medium text-muted-foreground">sitemap.xml 选项</span>

          <label className="flex items-center gap-2">
            <Switch
              checked={options.excludeFailed}
              onCheckedChange={(checked) => onOptionsChange({ excludeFailed: checked })}
            />
            <span className="text-muted-foreground">排除失败页面</span>
          </label>

          <label
            className="flex items-center gap-2"
            title="优先使用页面 Last-Modified 响应头，缺失时用抓取时间"
          >
            <Switch
              checked={options.includeLastmod}
              onCheckedChange={(checked) => onOptionsChange({ includeLastmod: checked })}
            />
            <span className="text-muted-foreground">
              lastmod<span className="ml-1 text-[11px] opacity-70">Last-Modified 优先</span>
            </span>
          </label>

          <label
            className="flex items-center gap-2"
            title="按链接深度分层：0→1.0 1→0.8 2→0.6 3→0.4 ≥4→0.2"
          >
            <Switch
              checked={options.includePriority}
              onCheckedChange={(checked) => onOptionsChange({ includePriority: checked })}
            />
            <span className="text-muted-foreground">
              priority<span className="ml-1 text-[11px] opacity-70">按深度分层</span>
            </span>
          </label>

          <label className="flex items-center gap-2">
            <Switch
              checked={options.includeChangefreq}
              onCheckedChange={(checked) => onOptionsChange({ includeChangefreq: checked })}
            />
            <span className="text-muted-foreground">changefreq</span>
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
                    {item.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : null}

          <span className="ml-auto flex flex-wrap items-center gap-2 border-l pl-4">
            <label
              className="flex items-center gap-2"
              title="超过每文件上限时自动切分并生成 sitemapindex.xml"
            >
              <Switch
                checked={options.splitSitemaps}
                onCheckedChange={(checked) => onOptionsChange({ splitSitemaps: checked })}
              />
              <span className="text-muted-foreground">拆分为多个文件</span>
            </label>

            {options.splitSitemaps ? (
              <label className="flex items-center gap-2">
                <span className="text-muted-foreground">每文件最多</span>
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
                <span className="text-muted-foreground">条</span>
              </label>
            ) : null}
          </span>
        </div>
      </CardContent>
    </Card>
  )
}