/**
 * Dashboard shell: composes the crawl engine with every panel.
 *
 * This file is deliberately layout-only — it owns the small amount of local state
 * (start URL input, validation error, view mode) and passes everything else down.
 * Crawl behaviour lives in `hooks/crawler/`, data shaping in `lib/`.
 *
 * 儀表板外殼：把抓取引擎與各個面板組裝起來。
 * 這個檔案刻意只負責版面——它只持有少量本地狀態（起始網址輸入、驗證錯誤、檢視模式），
 * 其餘都往下傳遞。抓取行為在 `hooks/crawler/`，資料整形在 `lib/`。
 */
'use client'

import { useCallback, useMemo, useState } from 'react'
import { AnimatePresence, LazyMotion, domAnimation, motion } from 'motion/react'

import { AlertsPanel } from '@/components/dashboard/AlertsPanel'
import { ChartsPanel } from '@/components/dashboard/ChartsPanel'
import { ControlPanel } from '@/components/dashboard/ControlPanel'
import { CurrentJobCard } from '@/components/dashboard/CurrentJobCard'
import { DashboardHeader } from '@/components/dashboard/DashboardHeader'
import { ExportBar } from '@/components/dashboard/ExportBar'
import { LogPanel } from '@/components/dashboard/LogPanel'
import { StatsCards } from '@/components/dashboard/StatsCards'
import { UrlList } from '@/components/dashboard/UrlList'
import { ViewTabs, type ViewMode } from '@/components/dashboard/ViewTabs'
import { useCrawler } from '@/hooks/crawler'
import { useStoredState } from '@/hooks/useStoredState'
import { formatDuration } from '@/lib/stats'

/** localStorage key for the remembered view mode. */
const VIEW_KEY = 'view-mode'

/** The whole application UI. */
export function SitemapBuilder() {
  const crawler = useCrawler()
  const [inputUrl, setInputUrl] = useState('')
  const [inputError, setInputError] = useState<string | null>(null)
  const [viewMode, setViewMode] = useStoredState<ViewMode>(VIEW_KEY, 'split')

  const { stats, records, phase, options } = crawler

  /** Validate and start a task. */
  const handleStart = useCallback(() => {
    const result = crawler.start(inputUrl)
    setInputError(result.ok ? null : (result.error ?? '输入无效'))
  }, [crawler, inputUrl])

  /** Records that should be exported, honouring the "exclude failed" switch. */
  const exportableRecords = useMemo(
    () => (options.excludeFailed ? records.filter((record) => record.status !== 'failed') : records),
    [records, options.excludeFailed],
  )

  /** Origin used for `<loc>` values inside a generated sitemapindex.xml. */
  const baseUrl = crawler.task?.origin ?? ''

  /** Banner copy when the visible state came from a snapshot. */
  const restoredSummary = crawler.restoredAt
    ? `上次任务已发现 ${records.length.toLocaleString()} 个页面，待处理 ${stats.pending.toLocaleString()} 个。`
    : null

  const showUrlList = viewMode !== 'logs'
  const showLogs = viewMode !== 'list'

  return (
    <LazyMotion features={domAnimation}>
      <main className="mx-auto flex min-h-svh w-full max-w-[1800px] flex-col gap-4 p-4">
        <DashboardHeader phase={phase} startUrl={crawler.task?.startUrl ?? null} />

        <ControlPanel
          inputUrl={inputUrl}
          onInputUrlChange={setInputUrl}
          onStart={handleStart}
          onPause={crawler.pause}
          onResume={crawler.resume}
          onStop={() => crawler.stop()}
          onReset={crawler.reset}
          phase={phase}
          options={options}
          onOptionsChange={crawler.setOptions}
        />

        <AlertsPanel
          inputError={inputError}
          persistError={crawler.persistError}
          restoredSummary={restoredSummary}
          showHint={phase === 'idle'}
          onResume={crawler.resume}
          onDiscard={crawler.reset}
        />

        <StatsCards stats={stats} formatDuration={formatDuration} />

        <CurrentJobCard
          task={crawler.task}
          phase={phase}
          currentUrl={crawler.currentUrl}
          currentStartedAt={crawler.currentStartedAt}
          now={crawler.now}
          stats={stats}
        />

        <ChartsPanel stats={stats} history={crawler.history} />

        {/* URL table + log panel, laid out per the view mode */}
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-end">
            <ViewTabs value={viewMode} onChange={setViewMode} />
          </div>

          <div
            className={
              viewMode === 'split'
                ? 'grid gap-4 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]'
                : 'grid gap-4'
            }
          >
            <AnimatePresence initial={false} mode="popLayout">
              {showUrlList ? (
                <motion.div
                  key="url-list"
                  layout
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.15 }}
                >
                  <UrlList records={records} loading={phase === 'running' && records.length === 0} />
                </motion.div>
              ) : null}
            </AnimatePresence>

            <AnimatePresence initial={false} mode="popLayout">
              {showLogs ? (
                <motion.div
                  key="log-panel"
                  layout
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.15 }}
                >
                  <LogPanel logs={crawler.logs} onClear={crawler.clearLogs} />
                </motion.div>
              ) : null}
            </AnimatePresence>
          </div>
        </div>

        <ExportBar
          records={exportableRecords}
          options={options}
          onOptionsChange={crawler.setOptions}
          task={crawler.task}
          baseUrl={baseUrl}
        />
      </main>
    </LazyMotion>
  )
}