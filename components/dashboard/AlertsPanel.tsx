/**
 * Status / hint banners shown between the control panel and the stat cards.
 *
 * Collected in one component so `SitemapBuilder` stays a layout file and the
 * conditional stack (invalid input → restore banner → persistence error → hint)
 * reads top-to-bottom in one place.
 *
 * 位於控制面板與統計卡之間的狀態／提示列。集中在單一元件，
 * 讓 `SitemapBuilder` 維持為版面檔案，並讓條件堆疊（輸入錯誤 → 續爬提示 →
 * 儲存失敗 → 使用說明）在一處由上而下閱讀。
 */
'use client'

import { History, Info, RotateCcw, TriangleAlert } from 'lucide-react'

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'

interface AlertsPanelProps {
  /** Non-null when the start URL could not be parsed. */
  inputError: string | null
  /** Non-null when the resume snapshot could not be written. */
  persistError: string | null
  /** Banner copy when the visible state came from a snapshot; null otherwise. */
  restoredSummary: string | null
  /** True while no task has been started: shows the how-to-use hint. */
  showHint: boolean
  /** Continue the restored task. */
  onResume: () => void
  /** Throw the restored snapshot away. */
  onDiscard: () => void
}

/** All the contextual alerts of the dashboard. */
export function AlertsPanel({
  inputError,
  persistError,
  restoredSummary,
  showHint,
  onResume,
  onDiscard,
}: AlertsPanelProps) {
  return (
    <div className="flex flex-col gap-2">
      {inputError ? (
        <Alert variant="destructive">
          <TriangleAlert className="size-4" />
          <AlertTitle>无法开始</AlertTitle>
          <AlertDescription className="block">{inputError}</AlertDescription>
        </Alert>
      ) : null}

      {persistError ? (
        <Alert variant="destructive">
          <TriangleAlert className="size-4" />
          <AlertTitle>本地保存失败</AlertTitle>
          <AlertDescription className="block">{persistError}</AlertDescription>
        </Alert>
      ) : null}

      {restoredSummary ? (
        <Alert>
          <History className="size-4" />
          <AlertTitle>发现未完成的任务</AlertTitle>
          <AlertDescription className="block">
            <p className="leading-relaxed">{restoredSummary}</p>
            <span className="mt-2 flex gap-2">
              <Button size="sm" onClick={onResume}>
                <RotateCcw className="size-3.5" />
                继续抓取
              </Button>
              <Button size="sm" variant="outline" onClick={onDiscard}>
                丢弃并重置
              </Button>
            </span>
          </AlertDescription>
        </Alert>
      ) : null}

      {showHint ? (
        <Alert>
          <Info className="size-4" />
          <AlertTitle>使用说明</AlertTitle>
          <AlertDescription className="block">
            {/* AlertDescription is a flex container, so prose must live in one element. */}
            <p className="leading-relaxed">
              输入形如 <code className="font-mono">https://www.example.com/test</code>{' '}
              的地址，应用会自动限定 origin 与路径前缀{' '}
              <code className="font-mono">/test</code>，只抓取同域且位于该前缀下的页面。
              注意：服务端默认禁止抓取内网地址，本地测试请以{' '}
              <code className="font-mono">ALLOW_PRIVATE_TARGETS=1</code> 启动。
            </p>
            <p className="mt-1 text-xs text-muted-foreground/80">
              起始地址的路径就是抓取范围：想抓整个 <code className="font-mono">/blog</code>{' '}
              请输入以 <code className="font-mono">/blog</code>{' '}
              结尾的目录地址，而不是某一篇文章的地址。
            </p>
          </AlertDescription>
        </Alert>
      ) : null}
    </div>
  )
}