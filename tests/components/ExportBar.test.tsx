/**
 * Component tests for `ExportBar`: optional-field switches, the split switch and
 * the download calls.
 *
 * `ExportBar` 的元件測試：選用欄位開關、拆分開關與下載呼叫。
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'

import { ExportBar } from '@/components/dashboard/ExportBar'
import { downloadFile, downloadFiles } from '@/lib/export'
import { DEFAULT_OPTIONS } from '@/hooks/crawler/constants'
import type { CrawlOptions, UrlRecord } from '@/types/crawl'

const NOW = Date.parse('2026-10-07T07:34:13Z')

vi.mock('@/lib/export', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/export')>()
  return {
    ...actual,
    downloadFile: vi.fn(actual.downloadFile),
    downloadFiles: vi.fn(actual.downloadFiles),
  }
})

/** Archive record preset. */
function record(url: string, extra: Partial<UrlRecord> = {}): UrlRecord {
  return {
    url,
    status: 'done',
    depth: 0,
    httpStatus: 200,
    pageTitle: 'T',
    finalUrl: null,
    lastModified: 'Tue, 01 Sep 2026 08:30:00 GMT',
    foundLinks: 0,
    queuedAt: NOW,
    startedAt: NOW,
    finishedAt: NOW,
    durationMs: 1000,
    ...extra,
  }
}

/** Options preset. */
function options(extra: Partial<CrawlOptions> = {}): CrawlOptions {
  return { ...DEFAULT_OPTIONS, ...extra }
}

/** Props preset. */
function props(overrides: Partial<Parameters<typeof ExportBar>[0]> = {}) {
  return {
    records: [record('https://example.com/a'), record('https://example.com/b')],
    options: options(),
    onOptionsChange: vi.fn(),
    task: { startUrl: 'https://example.com/', origin: 'https://example.com', pathPrefix: '' },
    baseUrl: 'https://example.com',
    ...overrides,
  }
}

beforeEach(() => {
  vi.mocked(downloadFile).mockClear()
  vi.mocked(downloadFiles).mockClear()
})

describe('ExportBar', () => {
  it('disables the export buttons without data / 無資料時停用匯出', () => {
    render(<ExportBar {...props({ records: [] })} />)
    expect(screen.getByRole('button', { name: /导出 sitemap.xml/ })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'CSV' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'JSON' })).toBeDisabled()
  })

  it('exports sitemap.xml with the switched fields / 依開關匯出 sitemap.xml', async () => {
    const user = userEvent.setup()
    render(<ExportBar {...props({ options: options({ includePriority: true, includeChangefreq: true }) })} />)
    await user.click(screen.getByRole('button', { name: /导出 sitemap.xml/ }))

    expect(downloadFile).toHaveBeenCalledTimes(1)
    const [, content, mime] = vi.mocked(downloadFile).mock.calls[0]
    expect(mime).toBe('application/xml')
    expect(content).toContain('<lastmod>2026-09-01T08:30:00+00:00</lastmod>')
    expect(content).toContain('<changefreq>daily</changefreq>')
    expect(content).toContain('<priority>1.0</priority>')
  })

  it('omits optional fields when switched off / 關閉時省略選用欄位', async () => {
    const user = userEvent.setup()
    render(<ExportBar {...props({ options: options({ includeLastmod: false }) })} />)
    await user.click(screen.getByRole('button', { name: /导出 sitemap.xml/ }))

    const [, content] = vi.mocked(downloadFile).mock.calls[0]
    expect(content).not.toContain('<lastmod>')
    expect(content).not.toContain('<priority>')
    expect(content).not.toContain('<changefreq>')
    expect(content).toContain('<loc>https://example.com/a</loc>')
  })

  it('exports CSV and JSON / 匯出 CSV 與 JSON', async () => {
    const user = userEvent.setup()
    render(<ExportBar {...props()} />)
    await user.click(screen.getByRole('button', { name: 'CSV' }))
    await user.click(screen.getByRole('button', { name: 'JSON' }))

    expect(downloadFile).toHaveBeenCalledTimes(2)
    const [csvName, csvContent] = vi.mocked(downloadFile).mock.calls[0]
    const [jsonName, jsonContent] = vi.mocked(downloadFile).mock.calls[1]
    expect(csvName).toBe('sitemap.csv')
    expect(csvContent).toContain('https://example.com/a')
    expect(jsonName).toBe('sitemap.json')
    const parsed = JSON.parse(jsonContent as string)
    expect(parsed.total).toBe(2)
    expect(parsed.task.startUrl).toBe('https://example.com/')
  })

  it('splits into several files when the switch is on / 開啟拆分後產生多檔', async () => {
    const user = userEvent.setup()
    render(
      <ExportBar
        {...props({
          options: options({ splitSitemaps: true, maxUrlsPerFile: 1 }),
        })}
      />,
    )
    await user.click(screen.getByRole('button', { name: /导出 sitemap.xml/ }))

    // Two records with one URL per file → 2 sitemaps + sitemapindex, zipped.
    expect(downloadFiles).toHaveBeenCalledTimes(1)
    const [payloads, zipName] = vi.mocked(downloadFiles).mock.calls[0]
    expect(zipName).toBe('sitemap-files.zip')
    expect(payloads.map((payload) => payload.name)).toEqual([
      'sitemap-1.xml',
      'sitemap-2.xml',
      'sitemapindex.xml',
    ])
  })

  it('keeps a single file when under the per-file limit / 未超限時維持單檔', async () => {
    const user = userEvent.setup()
    render(<ExportBar {...props({ options: options({ splitSitemaps: true, maxUrlsPerFile: 100 }) })} />)
    await user.click(screen.getByRole('button', { name: /导出 sitemap.xml/ }))

    // With the switch on, the export goes through downloadFiles even when no split
    // was needed; the single sitemap.xml arrives as one payload without an index.
    expect(downloadFiles).toHaveBeenCalledTimes(1)
    const [payloads] = vi.mocked(downloadFiles).mock.calls[0]
    expect(payloads.map((payload) => payload.name)).toEqual(['sitemap.xml'])
  })

  it('wires every optional-field switch into the options / 每個開關都寫入選項', async () => {
    const user = userEvent.setup()
    const onOptionsChange = vi.fn()
    render(<ExportBar {...props({ onOptionsChange })} />)

    const switches = screen.getAllByRole('switch')
    // [排除失败页面, lastmod, priority, changefreq, 拆分为多个文件]
    expect(switches).toHaveLength(5)
    await user.click(switches[0])
    expect(onOptionsChange).toHaveBeenLastCalledWith(expect.objectContaining({ excludeFailed: true }))
    await user.click(switches[1])
    expect(onOptionsChange).toHaveBeenLastCalledWith(expect.objectContaining({ includeLastmod: false }))
    await user.click(switches[2])
    expect(onOptionsChange).toHaveBeenLastCalledWith(expect.objectContaining({ includePriority: true }))
    await user.click(switches[3])
    expect(onOptionsChange).toHaveBeenLastCalledWith(expect.objectContaining({ includeChangefreq: true }))
    await user.click(switches[4])
    expect(onOptionsChange).toHaveBeenLastCalledWith(expect.objectContaining({ splitSitemaps: true }))
  })

  it('shows the changefreq dropdown only when switched on / 僅開啟時顯示下拉', async () => {
    const user = userEvent.setup()
    const { rerender } = render(<ExportBar {...props()} />)
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument()

    rerender(<ExportBar {...props({ options: options({ includeChangefreq: true }) })} />)
    expect(screen.getByRole('combobox')).toBeInTheDocument()

    void user
  })
})