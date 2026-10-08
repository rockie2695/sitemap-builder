/**
 * Component tests for `ExportBar`: option switches, priority strategy, URL shaping
 * switches and the download calls.
 *
 * `ExportBar` 的元件測試：選項開關、優先級策略、URL 呈現開關與下載呼叫。
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { ExportBar } from '@/components/dashboard/ExportBar'
import { downloadFile, downloadFiles } from '@/lib/export'
import { DEFAULT_OPTIONS } from '@/hooks/crawler/constants'
import { I18nWrapper, renderWithI18n, screen, userEvent, within } from '../helpers/render'
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

/** Locate the switch that belongs to a labelled control. */
function switchFor(label: string) {
  const labelElement = screen.getByText(label).closest('label')
  if (!labelElement) throw new Error(`no label wrapping ${label}`)
  return within(labelElement).getByRole('switch')
}

beforeEach(() => {
  vi.mocked(downloadFile).mockClear()
  vi.mocked(downloadFiles).mockClear()
})

describe('ExportBar', () => {
  it('disables the export buttons without data / 無資料時停用匯出', () => {
    renderWithI18n(<ExportBar {...props({ records: [] })} />)
    expect(screen.getByRole('button', { name: /Export sitemap.xml/ })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'CSV' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'JSON' })).toBeDisabled()
  })

  it('exports sitemap.xml with the switched fields / 依開關匯出 sitemap.xml', async () => {
    const user = userEvent.setup()
    renderWithI18n(
      <ExportBar {...props({ options: options({ includePriority: true, includeChangefreq: true }) })} />,
    )
    await user.click(screen.getByRole('button', { name: /Export sitemap.xml/ }))

    expect(downloadFile).toHaveBeenCalledTimes(1)
    const [, content, mime] = vi.mocked(downloadFile).mock.calls[0]
    expect(mime).toBe('application/xml')
    expect(content).toContain('<lastmod>2026-09-01T08:30:00+00:00</lastmod>')
    expect(content).toContain('<changefreq>daily</changefreq>')
    expect(content).toContain('<priority>1.0</priority>')
  })

  it('omits optional fields when switched off / 關閉時省略選用欄位', async () => {
    const user = userEvent.setup()
    renderWithI18n(<ExportBar {...props({ options: options({ includeLastmod: false }) })} />)
    await user.click(screen.getByRole('button', { name: /Export sitemap.xml/ }))

    const [, content] = vi.mocked(downloadFile).mock.calls[0]
    expect(content).not.toContain('<lastmod>')
    expect(content).not.toContain('<priority>')
    expect(content).not.toContain('<changefreq>')
    expect(content).toContain('<loc>https://example.com/a</loc>')
  })

  it('applies the host override to the exported XML / 匯出 XML 套用主機替換', async () => {
    const user = userEvent.setup()
    renderWithI18n(
      <ExportBar {...props({ options: options({ exportHostOverride: 'https://www.example.com' }) })} />,
    )
    await user.click(screen.getByRole('button', { name: /Export sitemap.xml/ }))

    const [, content] = vi.mocked(downloadFile).mock.calls[0]
    expect(content).toContain('<loc>https://www.example.com/a</loc>')
    expect(content).not.toContain('localhost')
  })

  it('exports CSV and JSON / 匯出 CSV 與 JSON', async () => {
    const user = userEvent.setup()
    renderWithI18n(<ExportBar {...props()} />)
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
    renderWithI18n(
      <ExportBar {...props({ options: options({ splitSitemaps: true, maxUrlsPerFile: 1 }) })} />,
    )
    await user.click(screen.getByRole('button', { name: /Export sitemap.xml/ }))

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
    renderWithI18n(
      <ExportBar {...props({ options: options({ splitSitemaps: true, maxUrlsPerFile: 100 }) })} />,
    )
    await user.click(screen.getByRole('button', { name: /Export sitemap.xml/ }))

    expect(downloadFiles).toHaveBeenCalledTimes(1)
    const [payloads] = vi.mocked(downloadFiles).mock.calls[0]
    expect(payloads.map((payload) => payload.name)).toEqual(['sitemap.xml'])
  })

  it('wires every boolean switch into the options / 每個開關都寫入選項', async () => {
    const user = userEvent.setup()
    const onOptionsChange = vi.fn()
    renderWithI18n(<ExportBar {...props({ onOptionsChange })} />)

    await user.click(switchFor('Exclude failed'))
    expect(onOptionsChange).toHaveBeenLastCalledWith(expect.objectContaining({ excludeFailed: true }))

    await user.click(switchFor('lastmod'))
    expect(onOptionsChange).toHaveBeenLastCalledWith(expect.objectContaining({ includeLastmod: false }))

    await user.click(switchFor('priority'))
    expect(onOptionsChange).toHaveBeenLastCalledWith(expect.objectContaining({ includePriority: true }))

    await user.click(switchFor('changefreq'))
    expect(onOptionsChange).toHaveBeenLastCalledWith(expect.objectContaining({ includeChangefreq: true }))

    await user.click(switchFor('Readable URLs'))
    expect(onOptionsChange).toHaveBeenLastCalledWith(expect.objectContaining({ readableUrls: true }))

    await user.click(switchFor('Use final URL'))
    expect(onOptionsChange).toHaveBeenLastCalledWith(expect.objectContaining({ useFinalUrl: true }))

    await user.click(switchFor('Split files'))
    expect(onOptionsChange).toHaveBeenLastCalledWith(expect.objectContaining({ splitSitemaps: true }))
  })

  it('shows the changefreq dropdown only when switched on / 僅開啟時顯示下拉', () => {
    const { rerender } = renderWithI18n(<ExportBar {...props()} />)
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument()

    rerender(
      <I18nWrapper>
        <ExportBar {...props({ options: options({ includeChangefreq: true }) })} />
      </I18nWrapper>,
    )
    expect(screen.getByRole('combobox')).toBeInTheDocument()
  })

  it('shows the priority strategy dropdown only when priority is on / 僅開啟 priority 時顯示策略下拉', () => {
    const { rerender } = renderWithI18n(<ExportBar {...props()} />)
    expect(screen.queryByText('By link depth')).not.toBeInTheDocument()

    rerender(
      <I18nWrapper>
        <ExportBar {...props({ options: options({ includePriority: true }) })} />
      </I18nWrapper>,
    )
    expect(screen.getByRole('combobox')).toBeInTheDocument()
  })

  it('reports the export result in the active locale / 以當前語系回報結果', async () => {
    const user = userEvent.setup()
    renderWithI18n(<ExportBar {...props()} />)
    await user.click(screen.getByRole('button', { name: 'JSON' }))
    expect(await screen.findByText('Exported sitemap.json')).toBeInTheDocument()
  })
})