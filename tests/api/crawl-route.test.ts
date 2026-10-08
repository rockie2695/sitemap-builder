/**
 * API tests for `app/api/crawl/route.ts`.
 *
 * The browser is injected via a fake `crawlPage` browser provider, so these tests
 * cover validation, SSRF and status mapping without launching Chromium.
 *
 * `app/api/crawl/route.ts` 的 API 測試。
 * 透過假的瀏覽器提供者注入，因此涵蓋驗證、SSRF 與狀態映射，而不必啟動 Chromium。
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { POST } from '@/app/api/crawl/route'
import { crawlPage, CRAWL_STATUS } from '@/lib/crawler/crawlPage'
import type { CrawlResponsePayload } from '@/lib/crawler/schema'

/** Mock the browser module: `crawlPage` is replaced per test. */
vi.mock('@/lib/crawler/crawlPage', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/crawler/crawlPage')>()
  return { ...actual, crawlPage: vi.fn(actual.crawlPage) }
})

/** A full successful payload. */
const okPayload: CrawlResponsePayload = {
  links: ['https://example.com/test/a.html'],
  skippedLinks: 0,
  pageUrl: 'https://example.com/test/',
  finalUrl: 'https://example.com/test/',
  pageTitle: 'Example',
  httpStatus: 200,
  lastModified: 'Tue, 01 Sep 2026 08:30:00 GMT',
  durationMs: 500,
}

/** Build a POST request with a JSON body. */
function post(body: unknown): Request {
  return new Request('http://localhost:3000/api/crawl', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

beforeEach(() => {
  delete process.env.ALLOW_PRIVATE_TARGETS
  vi.mocked(crawlPage).mockReset()
})

describe('request validation / 請求驗證', () => {
  it('rejects malformed JSON with 400 / 拒絕畸形 JSON', async () => {
    const request = new Request('http://localhost:3000/api/crawl', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{not json',
    })
    const response = await POST(request)
    expect(response.status).toBe(400)
    const payload = (await response.json()) as CrawlResponsePayload
    expect(payload.error).toContain('JSON')
  })

  it('rejects a missing url with 400 / 缺少 url 回 400', async () => {
    const response = await POST(post({ origin: 'https://example.com' }))
    expect(response.status).toBe(400)
    const payload = (await response.json()) as CrawlResponsePayload
    expect(payload.error).toContain('url')
  })

  it('rejects a missing origin with 400 / 缺少 origin 回 400', async () => {
    const response = await POST(post({ url: 'https://example.com/test/' }))
    expect(response.status).toBe(400)
  })

  it('rejects an invalid url format with 400 / 網址格式非法回 400', async () => {
    const response = await POST(post({ url: 'not-a-url', origin: 'https://example.com' }))
    expect(response.status).toBe(400)
    expect(crawlPage).not.toHaveBeenCalled()
  })
})

describe('SSRF policy / SSRF 政策', () => {
  it('blocks localhost with 400 / 擋下 localhost', async () => {
    const response = await POST(
      post({ url: 'http://localhost:4321/test/', origin: 'http://localhost:4321' }),
    )
    expect(response.status).toBe(400)
    const payload = (await response.json()) as CrawlResponsePayload
    expect(payload.error).toContain('SSRF')
    expect(crawlPage).not.toHaveBeenCalled()
  })

  it('blocks the cloud metadata address / 擋下雲端中繼資料位址', async () => {
    const response = await POST(
      post({ url: 'http://169.254.169.254/latest/meta-data/', origin: 'http://169.254.169.254' }),
    )
    expect(response.status).toBe(400)
  })

  it('allows private targets when the env override is set / 設定開關後放行', async () => {
    process.env.ALLOW_PRIVATE_TARGETS = '1'
    vi.mocked(crawlPage).mockResolvedValue({ status: CRAWL_STATUS.ok, payload: okPayload })

    const response = await POST(
      post({ url: 'http://localhost:4321/test/', origin: 'http://localhost:4321' }),
    )
    expect(response.status).toBe(200)
    expect(crawlPage).toHaveBeenCalledTimes(1)
  })
})

describe('status mapping / 狀態映射', () => {
  const target = { url: 'https://example.com/test/', origin: 'https://example.com' }

  it('maps ok to 200 / ok 對應 200', async () => {
    vi.mocked(crawlPage).mockResolvedValue({ status: CRAWL_STATUS.ok, payload: okPayload })
    const response = await POST(post(target))
    expect(response.status).toBe(200)
    const payload = (await response.json()) as CrawlResponsePayload
    expect(payload.links).toEqual(['https://example.com/test/a.html'])
    expect(payload.pageTitle).toBe('Example')
    expect(payload.lastModified).toBe('Tue, 01 Sep 2026 08:30:00 GMT')
  })

  it('maps partial success to 206 / 部分成功對應 206', async () => {
    vi.mocked(crawlPage).mockResolvedValue({
      status: CRAWL_STATUS.partial,
      payload: { ...okPayload, error: 'TimeoutError' },
    })
    const response = await POST(post(target))
    expect(response.status).toBe(206)
    const payload = (await response.json()) as CrawlResponsePayload
    expect(payload.error).toBe('TimeoutError')
    expect(payload.links).toHaveLength(1) // links still survive
  })

  it('maps a browser failure to 502 / 瀏覽器失敗對應 502', async () => {
    vi.mocked(crawlPage).mockResolvedValue({
      status: CRAWL_STATUS.failed,
      payload: { ...okPayload, links: [], error: 'Executable doesn\'t exist' },
    })
    const response = await POST(post(target))
    expect(response.status).toBe(502)
    const payload = (await response.json()) as CrawlResponsePayload
    expect(payload.links).toEqual([])
    expect(payload.error).toContain('Executable')
  })

  it('propagates the path scope and stripQuery / 傳遞路徑範圍與查詢策略', async () => {
    vi.mocked(crawlPage).mockResolvedValue({ status: 200, payload: okPayload })
    await POST(post({ ...target, pathPrefix: '/test', stripQuery: true }))
    // crawlPage takes a single params object; the abort signal rides inside it.
    expect(vi.mocked(crawlPage)).toHaveBeenCalledWith(
      expect.objectContaining({
        url: target.url,
        origin: target.origin,
        pathPrefix: '/test',
        stripQuery: true,
        signal: expect.anything(),
      }),
    )
  })
})