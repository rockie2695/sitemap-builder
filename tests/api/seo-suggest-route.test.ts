/**
 * API tests for `app/api/seo/suggest/route.ts`.
 *
 * The model call is mocked; `resolveLlmConfig` runs for real so the env/override
 * precedence is exercised too.
 *
 * `app/api/seo/suggest/route.ts` 的 API 測試。模型呼叫以 mock 取代；
 * `resolveLlmConfig` 走真實實作，因此也驗證 env／覆寫的優先順序。
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { POST } from '@/app/api/seo/suggest/route'
import { LlmError } from '@/lib/llm/openai'
import { suggestSeoFields } from '@/lib/llm/suggest'
import type { SuggestResponsePayload } from '@/lib/llm/schema'

vi.mock('@/lib/llm/suggest', () => ({ suggestSeoFields: vi.fn() }))

/** Build a POST request with a JSON body. */
function post(body: unknown): Request {
  return new Request('http://localhost:3000/api/seo/suggest', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

const base = { url: 'https://example.com/a', baseUrl: 'http://localhost:11434/v1', model: 'llama3.1' }

beforeEach(() => {
  vi.mocked(suggestSeoFields).mockReset()
  delete process.env.LLM_BASE_URL
  delete process.env.LLM_MODEL
  delete process.env.LLM_API_KEY
})

describe('request validation / 請求驗證', () => {
  it('rejects malformed JSON with 400 / 拒絕畸形 JSON', async () => {
    const request = new Request('http://localhost:3000/api/seo/suggest', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{nope',
    })
    const response = await POST(request)
    expect(response.status).toBe(400)
    expect(((await response.json()) as SuggestResponsePayload).errorCode).toBe('invalid')
  })

  it('rejects a bad url with 400 / 網址非法回 400', async () => {
    const response = await POST(post({ ...base, url: 'nope' }))
    expect(response.status).toBe(400)
    expect(suggestSeoFields).not.toHaveBeenCalled()
  })

  it('returns no_config when no endpoint is resolvable / 無端點時回 no_config', async () => {
    const response = await POST(post({ url: 'https://example.com/a' }))
    expect(response.status).toBe(400)
    expect(((await response.json()) as SuggestResponsePayload).errorCode).toBe('no_config')
  })
})

describe('success and failures / 成功與失敗', () => {
  it('returns the suggestion and the model name / 回傳建議與模型名稱', async () => {
    vi.mocked(suggestSeoFields).mockResolvedValue({ title: 'Better title', description: 'Better description', notes: ['n1'] })
    const response = await POST(post(base))
    expect(response.status).toBe(200)
    const payload = (await response.json()) as SuggestResponsePayload
    expect(payload).toMatchObject({ title: 'Better title', description: 'Better description', notes: ['n1'], model: 'llama3.1' })
  })

  it('maps a network failure to 502 / 網路失敗對應 502', async () => {
    vi.mocked(suggestSeoFields).mockRejectedValue(new LlmError('network', 'boom'))
    const response = await POST(post(base))
    expect(response.status).toBe(502)
    expect(((await response.json()) as SuggestResponsePayload).errorCode).toBe('network')
  })
})