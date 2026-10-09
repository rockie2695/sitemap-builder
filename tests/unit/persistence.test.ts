/**
 * Unit tests for `lib/persistence.ts` (resume-after-refresh snapshots).
 *
 * `lib/persistence.ts`（斷點續爬快照）的單元測試。
 */
import { beforeEach, describe, expect, it } from 'vitest'

import { loadSnapshot, saveSnapshot, type SaveInput } from '@/lib/persistence'
import type { LogEntry, UrlRecord } from '@/types/crawl'

const NOW = Date.parse('2026-10-07T07:34:13Z')
const STORAGE_KEY = 'sitemap-builder:crawl:v1'

/** Archive record preset. */
const record: UrlRecord = {
  url: 'https://example.com/a',
  status: 'done',
  depth: 0,
  httpStatus: 200,
  pageTitle: 'T',
  finalUrl: null,
  lastModified: null,
  redirected: false,
  foundLinks: 0,
  queuedAt: NOW,
  startedAt: NOW,
  finishedAt: NOW,
  durationMs: 1000,
}

/** Snapshot input preset. */
function input(extra: Partial<SaveInput> = {}): SaveInput {
  return {
    task: { startUrl: 'https://example.com/', origin: 'https://example.com', pathPrefix: '' },
    options: {
      stripQuery: true,
      maxPages: 1000,
      delayMs: 800,
      includeLastmod: true,
      includePriority: false,
      includeChangefreq: false,
      changefreq: 'auto',
      excludeFailed: false,
      excludeRedirected: false,
      splitSitemaps: false,
      maxUrlsPerFile: 1000,
      concurrency: 1,
      retryCount: 0,
      priorityStrategy: 'linkDepth',
      readableUrls: false,
      useFinalUrl: false,
      exportHostOverride: '',
    },
    queue: ['https://example.com/b'],
    records: [record],
    logs: [{ id: 1, ts: NOW, level: 'info', key: 'log.task.start', params: { url: 'https://example.com/' } }],
    logSeq: 1,
    stats: { startedAt: NOW, finishedAt: null, requests: 1, consecutiveErrors: 0, skippedLinks: 0 },
    history: [],
    ...extra,
  }
}

beforeEach(() => {
  window.localStorage.clear()
})

describe('persistence / 斷點續爬', () => {
  it('round-trips a snapshot / 快照可完整往返', () => {
    expect(saveSnapshot(input())).toEqual({ ok: true, seoDropped: false })
    const restored = loadSnapshot()
    expect(restored).not.toBeNull()
    expect(restored?.task.startUrl).toBe('https://example.com/')
    expect(restored?.records).toHaveLength(1)
    expect(restored?.records[0].url).toBe('https://example.com/a')
    expect(restored?.queue).toEqual(['https://example.com/b'])
    expect(restored?.logs).toHaveLength(1)
    expect(restored?.logSeq).toBe(1)
    expect(restored?.version).toBe(1)
    // The full option set survives, so the export switches restore too.
    expect(restored?.options.includeLastmod).toBe(true)
    expect(restored?.options.splitSitemaps).toBe(false)
  })

  it('returns null when nothing is stored / 無資料時回傳 null', () => {
    expect(loadSnapshot()).toBeNull()
  })

  it('returns null for corrupted JSON / 損壞的 JSON 回傳 null', () => {
    window.localStorage.setItem(STORAGE_KEY, '{not json')
    expect(loadSnapshot()).toBeNull()
  })

  it('returns null for a wrong version / 版本不符回傳 null', () => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: 99, records: [] }))
    expect(loadSnapshot()).toBeNull()
  })

  it('returns null when records are missing / 缺少 records 回傳 null', () => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: 1 }))
    expect(loadSnapshot()).toBeNull()
  })

  it('drops SEO snapshots when the payload is too large / 過大時丟棄 SEO 快照', () => {
    // ~1 KB of SEO data per record × 5000 records ≈ 5 MB, past the 3 MB guard.
    const bulky = {
      ...record,
      seo: {
        title: 'x'.repeat(300),
        titleLength: 300,
        metaDescription: 'y'.repeat(500),
        metaDescriptionLength: 500,
        h1: ['a'.repeat(100)],
        headings: [{ level: 1, text: 'a'.repeat(100) }],
        canonical: 'https://example.com/a',
        metaRobots: null,
        indexable: true,
        lang: 'en',
        hasViewport: true,
        openGraph: { title: true, description: true, image: true },
        twitter: { card: true, title: true, description: true, image: true },
        images: { total: 1, missingAlt: 0 },
        links: { internal: 1, external: 0, nofollow: 0 },
        wordCount: 300,
        structuredData: ['Article'],
        hreflang: [],
        keywords: Array.from({ length: 10 }, (_, index) => ({ term: 'keyword'.repeat(3) + index, count: 5 })),
      },
    }
    const records = Array.from({ length: 5000 }, (_, index) => ({
      ...bulky,
      url: 'https://example.com/page-' + index,
    }))

    const result = saveSnapshot(input({ records, queue: [] }))
    expect(result).toEqual({ ok: true, seoDropped: true })

    // The snapshot still restores; only the SEO payload was sacrificed.
    const restored = loadSnapshot()
    expect(restored?.records).toHaveLength(5000)
    expect(restored?.records[0].seo).toBeUndefined()
    expect(restored?.records[0].url).toBe('https://example.com/page-0')
    expect(restored?.logs).toHaveLength(1)
  })

  it('caps records, queue and logs / 截斷記錄、佇列與日誌', () => {
    const records = Array.from({ length: 6000 }, (_, index) => ({
      ...record,
      url: `https://example.com/page-${index}`,
    }))
    const queue = Array.from({ length: 6000 }, (_, index) => `https://example.com/q-${index}`)
    const logs: LogEntry[] = Array.from({ length: 600 }, (_, index) => ({
      id: index,
      ts: NOW,
      level: 'info' as const,
      key: 'log.task.start' as const,
      params: { url: `https://example.com/${index}` },
    }))

    saveSnapshot(input({ records, queue, logs }))
    const restored = loadSnapshot()
    expect(restored?.records.length).toBeLessThanOrEqual(5000)
    expect(restored?.queue.length).toBeLessThanOrEqual(5000)
    expect(restored?.logs.length).toBeLessThanOrEqual(500)
  })

  it('migrates pre-i18n log entries / 遷移 i18n 之前的日誌', () => {
    // A snapshot written before log entries became structured: plain text, no key.
    const legacy = {
      version: 1,
      savedAt: NOW,
      task: { startUrl: 'https://example.com/', origin: 'https://example.com', pathPrefix: '' },
      options: input().options,
      queue: [],
      records: [record],
      logs: [
        { id: 1, ts: NOW, level: 'info', message: '任务开始：https://example.com/' },
        { id: 2, ts: NOW, level: 'error', message: '抓取失败' },
        { id: 3, ts: NOW, level: 'info' }, // unusable → dropped
      ],
      logSeq: 3,
      stats: input().stats,
      history: [],
    }
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(legacy))

    const restored = loadSnapshot()
    expect(restored?.logs).toHaveLength(2)
    expect(restored?.logs[0].key).toBe('log.legacy')
    expect(restored?.logs[0].params?.message).toBe('任务开始：https://example.com/')
    expect(restored?.logs[1].level).toBe('error')
  })
})