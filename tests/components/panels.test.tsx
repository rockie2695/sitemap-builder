/**
 * Component tests for `UrlList` (search, filter, virtual window), `LogPanel`
 * (structured logs, level filter, auto-follow) and `ViewTabs`.
 *
 * `UrlList`（搜尋／篩選／虛擬視窗）、`LogPanel`（結構化日誌／等級篩選／自動跟隨）
 * 與 `ViewTabs` 的元件測試。
 */
import { describe, expect, it, vi } from 'vitest'

import { LogPanel } from '@/components/dashboard/LogPanel'
import { UrlList } from '@/components/dashboard/UrlList'
import { ViewTabs } from '@/components/dashboard/ViewTabs'
import { renderWithI18n, screen, userEvent } from '../helpers/render'
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
    renderWithI18n(<UrlList records={[]} />)
    expect(screen.getByText(/No URLs discovered yet/)).toBeInTheDocument()
  })

  it('renders skeleton rows while loading / 載入中顯示骨架', () => {
    const { container } = renderWithI18n(<UrlList records={[]} loading />)
    expect(container.querySelectorAll('[data-slot="skeleton"]').length).toBeGreaterThan(0)
  })

  it('renders one row per record / 每筆記錄一列', () => {
    renderWithI18n(
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

  it('translates the status column / 狀態欄位已在地化', () => {
    renderWithI18n(<UrlList records={[record('https://example.com/a')]} />)
    expect(screen.getByText('Done')).toBeInTheDocument()
  })

  it('filters by search keyword / 依關鍵字篩選', async () => {
    const user = userEvent.setup()
    renderWithI18n(
      <UrlList
        records={[
          record('https://example.com/blog/post-1', { pageTitle: 'Post 1' }),
          record('https://example.com/docs/page-1', { pageTitle: 'Docs' }),
        ]}
      />,
    )
    await user.type(screen.getByPlaceholderText('Search URL or title'), 'blog')
    expect(screen.getByRole('link', { name: 'https://example.com/blog/post-1' })).toBeInTheDocument()
    expect(
      screen.queryByRole('link', { name: 'https://example.com/docs/page-1' }),
    ).not.toBeInTheDocument()
  })

  it('matches the page title too / 也匹配頁面標題', async () => {
    const user = userEvent.setup()
    renderWithI18n(
      <UrlList
        records={[
          record('https://example.com/x', { pageTitle: 'About us' }),
          record('https://example.com/y'),
        ]}
      />,
    )
    await user.type(screen.getByPlaceholderText('Search URL or title'), 'About')
    expect(screen.getByRole('link', { name: 'https://example.com/x' })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'https://example.com/y' })).not.toBeInTheDocument()
  })

  it('shows a bounded window for large archives / 大量資料只渲染視窗', () => {
    const many = Array.from({ length: 2000 }, (_, index) =>
      record(`https://example.com/page-${index}.html`),
    )
    const { container } = renderWithI18n(<UrlList records={many} />)
    const rendered = container.querySelectorAll('a[href^="https://example.com/page-"]').length
    // Virtual window: far fewer rows than the archive, but enough to fill the box.
    expect(rendered).toBeGreaterThan(5)
    expect(rendered).toBeLessThan(100)
  })

  it('keeps the full-height spacer so scrolling reaches the end / 佔位高度正確', () => {
    const many = Array.from({ length: 2000 }, (_, index) =>
      record(`https://example.com/page-${index}.html`),
    )
    const { container } = renderWithI18n(<UrlList records={many} />)
    // jsdom has no layout engine, so scrollHeight is always 0 — assert the inline
    // spacer style instead: totalHeight = count × rowHeight.
    const spacer = container.querySelector('div[style*="height: 88000px"]')
    expect(spacer).not.toBeNull()
  })

  it('offers a clear-filter button after filtering / 篩選後提供清除按鈕', async () => {
    const user = userEvent.setup()
    renderWithI18n(<UrlList records={[record('https://example.com/a')]} />)
    await user.type(screen.getByPlaceholderText('Search URL or title'), 'zzz')
    expect(screen.getByRole('button', { name: /Clear filters/ })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /Clear filters/ }))
    expect(screen.getByRole('link', { name: 'https://example.com/a' })).toBeInTheDocument()
  })
})

describe('LogPanel', () => {
  /** Structured log entry preset. */
  const entry = (
    level: LogEntry['level'],
    key: LogEntry['key'],
    params?: LogEntry['params'],
    id = 1,
  ): LogEntry => ({ id, ts: NOW, level, key, params })

  it('renders an empty state / 無日誌時顯示空狀態', () => {
    renderWithI18n(<LogPanel logs={[]} onClear={vi.fn()} />)
    expect(screen.getByText('No log entries')).toBeInTheDocument()
  })

  it('renders structured entries in the active locale / 以當前語系呈現結構化日誌', () => {
    renderWithI18n(
      <LogPanel
        logs={[
          entry('info', 'log.task.start', { url: 'https://example.com/' }, 1),
          entry('success', 'log.task.finish', { total: 5, done: 5 }, 2),
          entry('error', 'log.page.fail', { message: 'boom' }, 3),
        ]}
        onClear={vi.fn()}
      />,
    )
    expect(screen.getByText('Task started: https://example.com/')).toBeInTheDocument()
    expect(screen.getByText('Queue drained: 5 page(s) discovered, 5 succeeded')).toBeInTheDocument()
    expect(screen.getByText('✗ Fetch failed: boom')).toBeInTheDocument()
  })

  it('decorates the page title onto success lines / 成功行帶上頁面標題', () => {
    renderWithI18n(
      <LogPanel
        logs={[
          entry(
            'success',
            'log.page.ok',
            { http: 'HTTP 200', title: 'Home', links: 3, seconds: '1.2' },
            1,
          ),
        ]}
        onClear={vi.fn()}
      />,
    )
    expect(screen.getByText('✓ HTTP 200 · Home · 3 link(s) · 1.2s')).toBeInTheDocument()
  })

  it('exposes the level filter UI / 提供等級篩選', () => {
    renderWithI18n(
      <LogPanel
        logs={[
          entry('info', 'log.task.start', { url: 'info-line' }, 1),
          entry('error', 'log.page.fail', { message: 'error-line' }, 2),
        ]}
        onClear={vi.fn()}
      />,
    )
    // Radix Select cannot be opened in jsdom (no pointer capture); the actual
    // filtering interaction is covered by the Playwright E2E suite.
    expect(screen.getByRole('combobox')).toBeInTheDocument()
    expect(screen.getByText('Task started: info-line')).toBeInTheDocument()
    expect(screen.getByText('✗ Fetch failed: error-line')).toBeInTheDocument()
  })

  it('filters by keyword on the rendered text / 依呈現文字篩選', async () => {
    const user = userEvent.setup()
    renderWithI18n(
      <LogPanel
        logs={[
          entry('info', 'log.task.start', { url: 'alpha-line' }, 1),
          entry('info', 'log.task.start', { url: 'beta-line' }, 2),
        ]}
        onClear={vi.fn()}
      />,
    )
    await user.type(screen.getByPlaceholderText('Search log'), 'beta')
    expect(screen.getByText('Task started: beta-line')).toBeInTheDocument()
    expect(screen.queryByText('Task started: alpha-line')).not.toBeInTheDocument()
  })

  it('clears the log via the clear button / 可清空日誌', async () => {
    const user = userEvent.setup()
    const onClear = vi.fn()
    renderWithI18n(<LogPanel logs={[entry('info', 'log.task.stopped', undefined, 1)]} onClear={onClear} />)
    await user.click(screen.getByTitle('Clear log'))
    expect(onClear).toHaveBeenCalledTimes(1)
  })

  it('virtualises large logs / 大量日誌視窗化', () => {
    const many: LogEntry[] = Array.from({ length: 3000 }, (_, index) =>
      entry('info', 'log.task.start', { url: `log-${index}` }, index),
    )
    const { container } = renderWithI18n(<LogPanel logs={many} onClear={vi.fn()} />)
    const rendered = container.textContent?.match(/log-\d+/g)?.length ?? 0
    expect(rendered).toBeGreaterThan(5)
    expect(rendered).toBeLessThan(100)
  })
})

describe('ViewTabs', () => {
  it('renders the three modes / 渲染三種模式', () => {
    renderWithI18n(<ViewTabs value="split" onChange={vi.fn()} />)
    expect(screen.getByRole('radio', { name: 'Split' })).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: 'List' })).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: 'Logs' })).toBeInTheDocument()
  })

  it('marks the active mode / 標記目前模式', () => {
    renderWithI18n(<ViewTabs value="logs" onChange={vi.fn()} />)
    expect(screen.getByRole('radio', { name: 'Logs' })).toBeChecked()
    expect(screen.getByRole('radio', { name: 'Split' })).not.toBeChecked()
  })

  it('fires onChange with the new mode / 觸發模式變更', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    renderWithI18n(<ViewTabs value="split" onChange={onChange} />)
    await user.click(screen.getByRole('radio', { name: 'Logs' }))
    expect(onChange).toHaveBeenCalledWith('logs')
  })
})