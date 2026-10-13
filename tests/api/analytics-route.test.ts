/**
 * API tests for `app/api/analytics/route.ts`.
 *
 * Only `runGa4Report` is replaced (the rest of the module stays real, as in the crawl
 * route test), so validation and status mapping are covered without a service-account
 * key or a network call.
 *
 * `app/api/analytics/route.ts` 的 API 測試。只替換 `runGa4Report`（模組其餘部分維持真實，
 * 與 crawl route 測試一致），因此不需服務帳戶金鑰或連網，即可涵蓋驗證與狀態映射。
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { POST } from '@/app/api/analytics/route'
import { runGa4Report } from '@/lib/analytics/ga4'
import type { AnalyticsResponsePayload } from '@/lib/analytics/schema'

vi.mock('@/lib/analytics/ga4', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/analytics/ga4')>()
  return { ...actual, runGa4Report: vi.fn() }
})

/** Build a POST request with a JSON body. */
function post(body: unknown): Request {
  return new Request('http://localhost:3000/api/analytics', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

beforeEach(() => vi.mocked(runGa4Report).mockReset())

describe('request validation / 請求驗證', () => {
  it('rejects malformed JSON with 400 / 拒絕畸形 JSON', async () => {
    const request = new Request('http://localhost:3000/api/analytics', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{nope',
    })
    const response = await POST(request)
    expect(response.status).toBe(400)
    expect(((await response.json()) as AnalyticsResponsePayload).errorCode).toBe('invalid')
  })

  it('rejects an empty path list / 空路徑清單回 400', async () => {
    const response = await POST(post({ paths: [] }))
    expect(response.status).toBe(400)
    expect(runGa4Report).not.toHaveBeenCalled()
  })
})

describe('status mapping / 狀態映射', () => {
  it('returns rows on success / 成功回傳列', async () => {
    vi.mocked(runGa4Report).mockResolvedValue([{ path: '/a', pageViews: 10, sessions: 4 }])
    const response = await POST(post({ paths: ['/a'] }))
    expect(response.status).toBe(200)
    expect(((await response.json()) as AnalyticsResponsePayload).rows).toEqual([
      { path: '/a', pageViews: 10, sessions: 4 },
    ])
    expect(vi.mocked(runGa4Report)).toHaveBeenCalledWith(
      expect.objectContaining({ paths: ['/a'], days: 28 }),
    )
  })
})