/**
 * Component tests for `UrlList` (search, filter, virtual window) and `LogPanel`
 * (level filter, auto-follow) and `ViewTabs`.
 *
 * `UrlList`（搜尋／篩選／虛擬視窗）、`LogPanel`（等級篩選／自動跟隨）
 * 與 `ViewTabs` 的元件測試。
 */
import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'

import { LogPanel } from '@/components/dashboard/LogPanel'
import { UrlList } from '@/components/dashboard/UrlList'
import { ViewTabs } from '@/components/dashboard/ViewTabs'
import type { LogEntry, UrlRecord } from '@/types/crawl'

const NOW = Date.parse('2026-10-07T08:00:00Z')

/** Archive record preset. */
function record(url: string, extra: Partial<UrlRecord> = {}): UrlRecord {
  return {
    url,
    status: 'done',
    depth: 0,
    httpStatus: 200,
    pageTitle: null,
    finalUrl: null,
    lastModified: null,
    foundLinks: 0,
    queuedAt: NOW,
    startedAt: NOW,
    finishedAt: NOW,
    durationMs: 1000,
    ...extra,
  }
}

describe('UrlList', () => {
  it('renders an empty state before any crawl / 無資料時顯示空狀態', () => {
    render(<UrlList records={[]} />)
    expect(screen.getByText(/还没有发现任何 URL/)).toBeInTheDocument()
  })

  it('renders skeleton rows while loading / 載入中顯示骨架', () => {
    const { container } = render(<UrlList records={[]} loading />)
    expect(container.querySelectorAll('[data-slot="skeleton"]').length).toBeGreaterThan(0)
  })

  it('renders one row per record / 每筆記錄一列', () => {
    render(
      <UrlList
        records={[
          record('https://example.com/a', { pageTitle: 'A' }),
          record('https://example.com/b', { status: 'queued' }),
        ]}
      />,
    )
    expect(screen.getByRole('link', { name: 'https://example.com/a' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'https://example.com/b' })).toBeInTheDocument()
    expect(screen.getByText('A')).toBeInTheDocument()
  })

  it('filters by search keyword / 依關鍵字篩選', async () => {
    const user = userEvent.setup()
    render(
      <UrlList
        records={[
          record('https://example.com/blog/post-1', { pageTitle: 'Post 1' }),
          record('https://example.com/docs/page-1', { pageTitle: 'Docs' }),
        ]}
      />,
    )
    await user.type(screen.getByPlaceholderText('搜索 URL 或标题'), 'blog')
    expect(screen.getByRole('link', { name: 'https://example.com/blog/post-1' })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'https://example.com/docs/page-1' })).not.toBeInTheDocument()
  })

  it('matches the page title too / 也匹配頁面標題', async () => {
    const user = userEvent.setup()
    render(
      <UrlList records={[record('https://example.com/x', { pageTitle: '關於我們' }), record('https://example.com/y')]} />,
    )
    await user.type(screen.getByPlaceholderText('搜索 URL 或标题'), '關於')
    expect(screen.getByRole('link', { name: 'https://example.com/x' })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'https://example.com/y' })).not.toBeInTheDocument()
  })

  it('shows a bounded window for large archives / 大量資料只渲染視窗', () => {
    const many = Array.from({ length: 2000 }, (_, index) =>
      record(`https://example.com/page-${index}.html`),
    )
    const { container } = render(<UrlList records={many} />)
    const rendered = container.querySelectorAll('a[href^="https://example.com/page-"]').length
    // Virtual window: far fewer rows than the archive, but enough to fill the box.
    expect(rendered).toBeGreaterThan(5)
    expect(rendered).toBeLessThan(100)
  })

  it('keeps the full-height spacer so scrolling reaches the end / 佔位高度正確', () => {
    const many = Array.from({ length: 2000 }, (_, index) =>
      record(`https://example.com/page-${index}.html`),
    )
    const { container } = render(<UrlList records={many} />)
    // jsdom has no layout engine, so scrollHeight is always 0 — assert the inline
    // spacer style instead: totalHeight = count × rowHeight.
    const spacer = container.querySelector('div[style*="height: 88000px"]')
    expect(spacer).not.toBeNull()
  })

  it('offers a clear-filter button after filtering / 篩選後提供清除按鈕', async () => {
    const user = userEvent.setup()
    render(<UrlList records={[record('https://example.com/a')]} />)
    await user.type(screen.getByPlaceholderText('搜索 URL 或标题'), 'zzz')
    expect(screen.getByRole('button', { name: /清除筛选/ })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /清除筛选/ }))
    expect(screen.getByRole('link', { name: 'https://example.com/a' })).toBeInTheDocument()
  })
})

describe('LogPanel', () => {
  /** Log entry preset. */
  const entry = (level: LogEntry['level'], message: string, id: number): LogEntry => ({
    id,
    ts: NOW,
    level,
    message,
  })

  it('renders an empty state / 無日誌時顯示空狀態', () => {
    render(<LogPanel logs={[]} onClear={vi.fn()} />)
    expect(screen.getByText('暂无日志')).toBeInTheDocument()
  })

  it('renders entries in order / 依序顯示日誌', () => {
    render(
      <LogPanel
        logs={[entry('info', '任务开始', 1), entry('success', '✓ 完成', 2), entry('error', '✗ 失败', 3)]}
        onClear={vi.fn()}
      />,
    )
    expect(screen.getByText('任务开始')).toBeInTheDocument()
    expect(screen.getByText('✓ 完成')).toBeInTheDocument()
    expect(screen.getByText('✗ 失败')).toBeInTheDocument()
  })

  it('exposes the level filter UI / 提供等級篩選', () => {
    render(
      <LogPanel logs={[entry('info', 'info-line', 1), entry('error', 'error-line', 2)]} onClear={vi.fn()} />,
    )
    // Radix Select cannot be opened in jsdom (no pointer capture); the actual
    // filtering interaction is covered by the Playwright E2E suite.
    expect(screen.getByRole('combobox')).toBeInTheDocument()
    expect(screen.getByText('info-line')).toBeInTheDocument()
    expect(screen.getByText('error-line')).toBeInTheDocument()
  })

  it('filters by keyword / 依關鍵字篩選', async () => {
    const user = userEvent.setup()
    render(<LogPanel logs={[entry('info', 'alpha-line', 1), entry('info', 'beta-line', 2)]} onClear={vi.fn()} />)
    await user.type(screen.getByPlaceholderText('搜索日志'), 'beta')
    expect(screen.getByText('beta-line')).toBeInTheDocument()
    expect(screen.queryByText('alpha-line')).not.toBeInTheDocument()
  })

  it('clears the log via the clear button / 可清空日誌', async () => {
    const user = userEvent.setup()
    const onClear = vi.fn()
    render(<LogPanel logs={[entry('info', 'x', 1)]} onClear={onClear} />)
    await user.click(screen.getByTitle('清空日志'))
    expect(onClear).toHaveBeenCalledTimes(1)
  })

  it('virtualises large logs / 大量日誌視窗化', () => {
    const many: LogEntry[] = Array.from({ length: 3000 }, (_, index) =>
      entry('info', `log-${index}`, index),
    )
    const { container } = render(<LogPanel logs={many} onClear={vi.fn()} />)
    const rendered = container.textContent?.match(/log-\d+/g)?.length ?? 0
    expect(rendered).toBeGreaterThan(5)
    expect(rendered).toBeLessThan(100)
  })
})

describe('ViewTabs', () => {
  it('renders the three modes / 渲染三種模式', () => {
    render(<ViewTabs value="split" onChange={vi.fn()} />)
    expect(screen.getByRole('radio', { name: '分栏' })).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: '列表' })).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: '日志' })).toBeInTheDocument()
  })

  it('marks the active mode / 標記目前模式', () => {
    render(<ViewTabs value="logs" onChange={vi.fn()} />)
    expect(screen.getByRole('radio', { name: '日志' })).toBeChecked()
    expect(screen.getByRole('radio', { name: '分栏' })).not.toBeChecked()
  })

  it('fires onChange with the new mode / 觸發模式變更', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<ViewTabs value="split" onChange={onChange} />)
    await user.click(screen.getByRole('radio', { name: '日志' }))
    expect(onChange).toHaveBeenCalledWith('logs')
  })
})