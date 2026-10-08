/**
 * Unit tests for `lib/export/*`: CSV, JSON and log text.
 *
 * `lib/export/*` 的單元測試：CSV、JSON 與日誌文字。
 */
import { describe, expect, it } from 'vitest'

import { buildCsv } from '@/lib/export/csv'
import { buildJson } from '@/lib/export/json'
import { buildLogText } from '@/lib/export/log'
import type { LogEntry, UrlRecord } from '@/types/crawl'

const NOW = Date.parse('2026-10-07T07:34:13Z')

/** Archive record preset. */
function record(extra: Partial<UrlRecord> = {}): UrlRecord {
  return {
    url: 'https://example.com/a',
    status: 'done',
    depth: 1,
    discoveredFrom: 'https://example.com/',
    httpStatus: 200,
    pageTitle: '頁面 A',
    finalUrl: null,
    lastModified: 'Tue, 01 Sep 2026 08:30:00 GMT',
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
    expect(buildCsv([]).charCodeAt(0)).toBe(0xfeff)
  })

  it('writes every column / 寫出所有欄位', () => {
    const header = buildCsv([record()]).split('\r\n')[0]
    for (const column of ['URL', '状态', 'HTTP状态码', '页面标题', '深度', 'lastmod', '建议priority', '建议changefreq', '错误信息']) {
      expect(header).toContain(column)
    }
  })

  it('writes one row per record / 每筆記錄一列', () => {
    const csv = buildCsv([record(), record({ url: 'https://example.com/b', status: 'failed', error: 'HTTP 404' })])
    expect(csv.trim().split('\r\n')).toHaveLength(3) // header + 2 rows
  })

  it('includes lastmod and the suggested priority / 包含 lastmod 與建議 priority', () => {
    const row = buildCsv([record()]).split('\r\n')[1]
    expect(row).toContain('2026-09-01T08:30:00+00:00') // lastmod from the header
    expect(row).toContain('"0.8"') // priority for depth 1
    expect(row).toContain('weekly') // changefreq for depth 1
  })

  it('escapes quotes by doubling / 雙引號以成對轉義', () => {
    const row = buildCsv([record({ pageTitle: '他說 "嗨"' })]).split('\r\n')[1]
    expect(row).toContain('"他說 ""嗨"""')
  })

  it('renders empty quoted cells for nulls / null 輸出空引號欄位', () => {
    // Every cell is quoted, so a null becomes `""` rather than a bare comma.
    const row = buildCsv([record({ pageTitle: null, lastModified: null, error: undefined })]).split('\r\n')[1]
    expect(row).toContain(',"",')
  })
})

describe('buildJson / JSON 匯出', () => {
  it('embeds task metadata and the record count / 內嵌任務資訊與筆數', () => {
    const parsed = JSON.parse(
      buildJson([record()], { startUrl: 'https://example.com/', origin: 'https://example.com', pathPrefix: '' }),
    )
    expect(parsed.total).toBe(1)
    expect(parsed.task.startUrl).toBe('https://example.com/')
    expect(parsed.exportedAt).toBeDefined()
  })

  it('adds suggested lastmod / priority / changefreq / 附加建議欄位', () => {
    const parsed = JSON.parse(buildJson([record()], null))
    expect(parsed.records[0].suggestedLastmod).toBe('2026-09-01T08:30:00+00:00')
    expect(parsed.records[0].suggestedPriority).toBe(0.8)
    expect(parsed.records[0].suggestedChangefreq).toBe('weekly')
    // The raw record fields survive.
    expect(parsed.records[0].url).toBe('https://example.com/a')
  })

  it('handles a null task / 任務為 null 時可用', () => {
    const parsed = JSON.parse(buildJson([], null))
    expect(parsed.task).toBeNull()
    expect(parsed.total).toBe(0)
  })
})

describe('buildLogText / 日誌匯出', () => {
  it('formats entries with timestamp and level / 帶時間戳與等級', () => {
    const logs: LogEntry[] = [
      { id: 1, ts: new Date(2026, 0, 1, 9, 5, 3, 42).getTime(), level: 'info', message: '开始' },
      { id: 2, ts: new Date(2026, 0, 1, 9, 5, 4, 0).getTime(), level: 'error', message: '失败' },
    ]
    const text = buildLogText(logs)
    expect(text.split('\n')).toHaveLength(2)
    expect(text).toContain('09:05:03.042 [INFO   ] 开始')
    expect(text).toContain('09:05:04.000 [ERROR  ] 失败')
  })

  it('returns an empty string for no logs / 無日誌時回傳空字串', () => {
    expect(buildLogText([])).toBe('')
  })
})