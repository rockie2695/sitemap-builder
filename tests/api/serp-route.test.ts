/**
 * API tests for `app/api/serp/route.ts`.
 *
 * `fetchSerp` is mocked, so validation and status mapping are covered without a
 * browser or a network call.
 *
 * `app/api/serp/route.ts` 的 API 測試。以 mock 取代 `fetchSerp`，
 * 因此不必啟動瀏覽器或連網，即可涵蓋驗證與狀態映射。
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { POST } from '@/app/api/serp/route'
import { SerpError, fetchSerp } from '@/lib/serp/provider'
import type { SerpResponse } from '@/types/serp'

vi.mock('@/lib/serp/provider', () => {
  class MockSerpError extends Error {
    constructor(
      public code: string,
      message: string,
    ) {
      super(message)
      this.name = 'SerpError'
    }
  }
  return { SerpError: MockSerpError, fetchSerp: vi.fn() }
})

/** Build a POST request with a JSON body. */
function post(body: unknown): Request {
  return new Request('http://localhost:3000/api/serp', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

const validBody = {
  query: 'widget guide',
  targetUrl: 'https://example.com/widgets',
  engine: 'google',
  provider: 'auto',
  analyzeTop: 2,
}

beforeEach(() => {
  vi.mocked(fetchSerp).mockReset()
})

describe('request validation / 請求驗證', () => {
  it('rejects malformed JSON with 400 / 拒絕畸形 JSON', async () => {
    const request = new Request('http://localhost:3000/api/serp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{not json',
    })
    const response = await POST(request)
    expect(response.status).toBe(400)
    const payload = (await response.json()) as SerpResponse
    expect(payload.errorCode).toBe('invalid')
  })

  it('rejects a bad target URL with 400 / 目標網址非法回 400', async () => {
    const response = await POST(post({ ...validBody, targetUrl: 'not-a-url' }))
    expect(response.status).toBe(400)
    expect(fetchSerp).not.toHaveBeenCalled()
  })

  it('rejects an out-of-range analyzeTop with 400 / 超出範圍的 analyzeTop 回 400', async () => {
    const response = await POST(post({ ...validBody, analyzeTop: 99 }))
    expect(response.status).toBe(400)
    expect(fetchSerp).not.toHaveBeenCalled()
  })
})

describe('status mapping / 狀態映射', () => {
  it('returns the ranking payload on success / 成功時回傳排名', async () => {
    vi.mocked(fetchSerp).mockResolvedValue({
      provider: 'serpapi',
      rank: 4,
      results: [{ position: 1, url: 'https://top.com/', title: 'Top', hostname: 'top.com' }],
      competitors: [],
    })
    const response = await POST(post(validBody))
    expect(response.status).toBe(200)
    const payload = (await response.json()) as SerpResponse
    expect(payload.rank).toBe(4)
    expect(payload.provider).toBe('serpapi')
    expect(payload.results).toHaveLength(1)
  })

  it('maps a blocked error to 502 / 被封鎖對應 502', async () => {
    vi.mocked(fetchSerp).mockRejectedValue(new SerpError('blocked', 'CAPTCHA'))
    const response = await POST(post(validBody))
    expect(response.status).toBe(502)
    const payload = (await response.json()) as SerpResponse
    expect(payload.errorCode).toBe('blocked')
  })

  it('maps a missing key to 400 / 缺少 key 對應 400', async () => {
    vi.mocked(fetchSerp).mockRejectedValue(new SerpError('no_key', 'SERPAPI_KEY is not configured'))
    const response = await POST(post(validBody))
    expect(response.status).toBe(400)
    const payload = (await response.json()) as SerpResponse
    expect(payload.errorCode).toBe('no_key')
  })
})