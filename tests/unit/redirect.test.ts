/**
 * Unit tests for `lib/crawler/redirect.ts`.
 *
 * `lib/crawler/redirect.ts` 的單元測試。
 */
import { describe, expect, it } from 'vitest'

import { isRedirected, shouldExcludeFromExport } from '@/lib/crawler/redirect'
import { isSameUrl } from '@/lib/url-utils'

describe('isSameUrl / 網址等價', () => {
  it('ignores a trailing slash / 忽略末尾斜線', () => {
    expect(isSameUrl('https://x.test/a', 'https://x.test/a/')).toBe(true)
  })

  it('ignores the hash / 忽略 hash', () => {
    expect(isSameUrl('https://x.test/a', 'https://x.test/a#top')).toBe(true)
  })

  it('honours the query policy / 依查詢策略判斷', () => {
    expect(isSameUrl('https://x.test/a', 'https://x.test/a?x=1')).toBe(false)
    expect(isSameUrl('https://x.test/a', 'https://x.test/a?x=1', { stripQuery: true })).toBe(true)
  })

  it('compares invalid input verbatim / 非法輸入以原字串比較', () => {
    expect(isSameUrl('::::', '::::')).toBe(true)
    expect(isSameUrl('::::', 'https://x.test/a')).toBe(false)
  })
})

describe('isRedirected / 重定向判定', () => {
  it('detects a different final URL / 最終位址不同時判定為重定向', () => {
    expect(isRedirected('https://x.test/old', 'https://x.test/new', true)).toBe(true)
  })

  it('ignores a trailing-slash-only difference / 僅差末尾斜線不算', () => {
    expect(isRedirected('https://x.test/a', 'https://x.test/a/', true)).toBe(false)
  })

  it('ignores a stripped query difference / 被剔除的查詢不算', () => {
    expect(isRedirected('https://x.test/a', 'https://x.test/a?utm_source=x', true)).toBe(false)
    // With stripQuery on, `?page=2` is dropped too, so it is the same address.
    expect(isRedirected('https://x.test/a', 'https://x.test/a?page=2', true)).toBe(false)
    // With the query kept, it is a different address.
    expect(isRedirected('https://x.test/a', 'https://x.test/a?page=2', false)).toBe(true)
  })

  it('treats a missing final URL as not redirected / 缺少最終位址不算', () => {
    expect(isRedirected('https://x.test/a', null, true)).toBe(false)
    expect(isRedirected('https://x.test/a', undefined, true)).toBe(false)
  })
})

describe('shouldExcludeFromExport / 匯出排除', () => {
  const done = { status: 'done' as const, redirected: false }
  const failed = { status: 'failed' as const, redirected: false }
  const bounced = { status: 'done' as const, redirected: true }

  it('keeps everything when both switches are off / 兩個開關都關時不排除', () => {
    const options = { excludeFailed: false, excludeRedirected: false }
    expect(shouldExcludeFromExport(done, options)).toBe(false)
    expect(shouldExcludeFromExport(failed, options)).toBe(false)
    expect(shouldExcludeFromExport(bounced, options)).toBe(false)
  })

  it('drops failed pages only / 只排除失敗頁面', () => {
    const options = { excludeFailed: true, excludeRedirected: false }
    expect(shouldExcludeFromExport(failed, options)).toBe(true)
    expect(shouldExcludeFromExport(done, options)).toBe(false)
    expect(shouldExcludeFromExport(bounced, options)).toBe(false)
  })

  it('drops redirected pages only / 只排除重定向頁面', () => {
    const options = { excludeFailed: false, excludeRedirected: true }
    expect(shouldExcludeFromExport(bounced, options)).toBe(true)
    expect(shouldExcludeFromExport(done, options)).toBe(false)
    expect(shouldExcludeFromExport(failed, options)).toBe(false)
  })

  it('drops both when both are on / 兩者皆開時都排除', () => {
    const options = { excludeFailed: true, excludeRedirected: true }
    expect(shouldExcludeFromExport(failed, options)).toBe(true)
    expect(shouldExcludeFromExport(bounced, options)).toBe(true)
    expect(shouldExcludeFromExport(done, options)).toBe(false)
  })
})