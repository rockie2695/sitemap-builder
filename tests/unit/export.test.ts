/**
 * Unit tests for `lib/export/*`: CSV, JSON and log text.
 *
 * `lib/export/*` 的單元測試：CSV、JSON 與日誌文字。
 */
import { describe, expect, it } from 'vitest'

import { buildCsv } from '@/lib/export/csv'
import { buildJson } from '@/lib/export/json'
import { buildLogText } from '@/lib/export/log'
import type { SitemapExportOptions } from '@/lib/sitemap/entries'
import type { LogEntry, UrlRecord } from '@/types/crawl'

const NOW = Date.parse('2026-10-07T07:34:13Z')

/** Exporter context: every switch off, no URL shaping. */
const OPTIONS: SitemapExportOptions = {
  includeLastmod: true,
  includePriority: true,
  priorityStrategy: 'linkDepth',
  includeChangefreq: true,
  changefreq: 'auto',
  readableUrls: false,
  useFinalUrl: false,
  hostOverride: '',
  pathPrefix: '',
}

/** Archive record preset. */
function record(extra: Partial<UrlRecord> = {}): UrlRecord {
  return {
    url: 'https://example.com/a',
    status: 'done',
    depth: 1,
    discoveredFrom: 'https://example.com/',
    httpStatus: 200,
    pageTitle: 'Page A',
    finalUrl: null,
    lastModified: 'Tue, 01 Sep 2026 08:30:00 GMT',
    redirected: false,
    foundLinks: 3,
    queuedAt: NOW,
    startedAt: NOW,
    finishedAt: NOW,
    durationMs: 1200,
    ...extra,
  }
}

describe('buildCsv / CSV 匯出', () => {
  it('starts with a UTF-8 BOM / 檔頭有 BOM', () => {
    expect(buildCsv([], OPTIONS).charCodeAt(0)).toBe(0xfeff)
  })

  it('writes every column / 寫出所有欄位', () => {
    const header = buildCsv([record()], OPTIONS).split('\r\n')[0]
    for (const column of [
      'URL',
      'status',
      'httpStatus',
      'title',
      'depth',
      'pathDepth',
      'discoveredFrom',
      'foundLinks',
      'durationMs',
      'lastmod',
      'suggestedPriority',
      'suggestedChangefreq',
      'error',
    ]) {
      expect(header).toContain(column)
    }
  })

  it('writes one row per record / 每筆記錄一列', () => {
    const csv = buildCsv(
      [record(), record({ url: 'https://example.com/b', status: 'failed', error: 'HTTP 404' })],
      OPTIONS,
    )
    expect(csv.trim().split('\r\n')).toHaveLength(3) // header + 2 rows
  })

  it('includes lastmod, path depth and the suggested priority / 包含 lastmod、路徑深度與建議 priority', () => {
    const row = buildCsv([record({ url: 'https://example.com/a/b' })], OPTIONS).split('\r\n')[1]
    expect(row).toContain('2026-09-01T08:30:00+00:00') // lastmod from the header
    expect(row).toContain('"0.8"') // priority for link depth 1
    expect(row).toContain('weekly') // changefreq for link depth 1
    expect(row).toContain('"2"') // path depth of /a/b
  })

  it('honours the priority strategy / 遵循 priority 策略', () => {
    const row = buildCsv([record({ url: 'https://example.com/a/b', depth: 0 })], {
      ...OPTIONS,
      priorityStrategy: 'pathDepth',
    }).split('\r\n')[1]
    expect(row).toContain('"0.8"') // /a/b = depth 2 → 0.8
  })

  it('escapes quotes by doubling / 雙引號以成對轉義', () => {
    const row = buildCsv([record({ pageTitle: 'He said "hi"' })], OPTIONS).split('\r\n')[1]
    expect(row).toContain('"He said ""hi"""')
  })

  it('renders empty quoted cells for nulls / null 輸出空引號欄位', () => {
    const row = buildCsv([record({ pageTitle: null, lastModified: null, error: undefined })], OPTIONS)
      .split('\r\n')[1]
    expect(row).toContain(',"",')
  })

  it('applies the host override / 套用主機替換', () => {
    const row = buildCsv([record()], { ...OPTIONS, hostOverride: 'https://www.example.com' })
      .split('\r\n')[1]
    expect(row).toContain('https://www.example.com/a')
  })
})

describe('buildJson / JSON 匯出', () => {
  it('embeds task metadata and the record count / 內嵌任務資訊與筆數', () => {
    const parsed = JSON.parse(
      buildJson(
        [record()],
        { startUrl: 'https://example.com/', origin: 'https://example.com', pathPrefix: '' },
        OPTIONS,
      ),
    )
    expect(parsed.total).toBe(1)
    expect(parsed.task.startUrl).toBe('https://example.com/')
    expect(parsed.exportedAt).toBeDefined()
  })

  it('adds suggested lastmod / priority / changefreq / 附加建議欄位', () => {
    const parsed = JSON.parse(buildJson([record()], null, OPTIONS))
    expect(parsed.records[0].suggestedLastmod).toBe('2026-09-01T08:30:00+00:00')
    expect(parsed.records[0].suggestedPriority).toBe(0.8)
    expect(parsed.records[0].suggestedChangefreq).toBe('weekly')
  })

  it('applies the URL pipeline to the url field / URL 欄位套用呈現流程', () => {
    const parsed = JSON.parse(
      buildJson([record()], null, {
        ...OPTIONS,
        hostOverride: 'https://www.example.com',
        readableUrls: true,
      }),
    )
    expect(parsed.records[0].url).toBe('https://www.example.com/a')
  })

  it('handles a null task / 任務為 null 時可用', () => {
    const parsed = JSON.parse(buildJson([], null, OPTIONS))
    expect(parsed.task).toBeNull()
    expect(parsed.total).toBe(0)
  })
})

describe('buildLogText / 日誌匯出', () => {
  /** Structured log entry preset. */
  const entry = (
    level: LogEntry['level'],
    key: LogEntry['key'],
    params?: LogEntry['params'],
    ts = NOW,
  ): LogEntry => ({ id: 1, ts, level, key, params })

  it('formats entries with timestamp and level / 帶時間戳與等級', () => {
    const logs: LogEntry[] = [
      entry('info', 'log.task.start', { url: 'https://example.com/' }, new Date(2026, 0, 1, 9, 5, 3, 42).getTime()),
      entry('error', 'log.page.fail', { message: 'boom' }, new Date(2026, 0, 1, 9, 5, 4, 0).getTime()),
    ]
    const text = buildLogText(logs, 'en')
    expect(text.split('\n')).toHaveLength(2)
    expect(text).toContain('09:05:03.042 [INFO   ] Task started: https://example.com/')
    expect(text).toContain('09:05:04.000 [ERROR  ] ✗ Fetch failed: boom')
  })

  it('renders in the requested locale / 以指定語系輸出', () => {
    const logs: LogEntry[] = [entry('success', 'log.task.finish', { total: 5, done: 5 })]
    expect(buildLogText(logs, 'en')).toContain('Queue drained: 5 page(s) discovered, 5 succeeded')
    expect(buildLogText(logs, 'zh-TW')).toContain('佇列已清空，抓取結束：共發現 5 個頁面，成功 5 個')
    expect(buildLogText(logs, 'zh-CN')).toContain('队列已清空，抓取结束：共发现 5 个页面，成功 5 个')
  })

  it('returns an empty string for no logs / 無日誌時回傳空字串', () => {
    expect(buildLogText([], 'en')).toBe('')
  })
})