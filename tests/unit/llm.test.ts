/**
 * Unit tests for the OpenAI-compatible LLM client, suggestions and vision fallback.
 *
 * OpenAI 相容 LLM 客戶端、建議與視覺備援的單元測試。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  LlmError,
  chatCompletion,
  extractJson,
  normalizeBaseUrl,
  resolveLlmConfig,
  resolveVisionConfig,
} from '@/lib/llm/openai'
import { buildSuggestMessages, parseSuggestion, suggestSeoFields } from '@/lib/llm/suggest'
import { buildVisionMessages, parseVisionSerp } from '@/lib/llm/vision'

beforeEach(() => {
  delete process.env.LLM_BASE_URL
  delete process.env.LLM_MODEL
  delete process.env.LLM_API_KEY
  delete process.env.LLM_VISION_MODEL
})
afterEach(() => vi.restoreAllMocks())

describe('config resolution / 設定解析', () => {
  it('normalizes the base URL / 正規化 base URL', () => {
    expect(normalizeBaseUrl('http://localhost:11434/v1/')).toBe('http://localhost:11434/v1')
  })

  it('prefers overrides, then env, then nothing / 優先順序：覆寫 → env → 無', () => {
    expect(resolveLlmConfig({})).toBeNull()
    process.env.LLM_BASE_URL = 'http://env/v1'
    process.env.LLM_MODEL = 'env-model'
    process.env.LLM_API_KEY = 'secret'
    expect(resolveLlmConfig({})).toMatchObject({ baseUrl: 'http://env/v1', model: 'env-model', apiKey: 'secret' })
    expect(resolveLlmConfig({ baseUrl: 'http://ui/v1', model: 'ui-model' })).toMatchObject({
      baseUrl: 'http://ui/v1',
      model: 'ui-model',
    })
  })

  it('enables vision only with a vision model / 僅在設定視覺模型時啟用', () => {
    process.env.LLM_BASE_URL = 'http://env/v1'
    expect(resolveVisionConfig()).toBeNull()
    process.env.LLM_VISION_MODEL = 'llava'
    expect(resolveVisionConfig()).toMatchObject({ model: 'llava' })
  })
})

describe('extractJson / 取出 JSON', () => {
  it('parses plain JSON / 解析純 JSON', () => {
    expect(extractJson<{ a: number }>('{"a":1}')).toEqual({ a: 1 })
  })

  it('parses fenced JSON / 解析圍籬 JSON', () => {
    expect(extractJson<{ a: number }>('here you go:\n```json\n{"a":2}\n```')).toEqual({ a: 2 })
  })

  it('parses JSON embedded in prose / 解析夾在文字中的 JSON', () => {
    expect(extractJson<number[]>('Sure! [1, 2, 3] hope that helps')).toEqual([1, 2, 3])
  })

  it('throws on unparseable text / 無法解析時丟錯', () => {
    expect(() => extractJson('no json here')).toThrow(LlmError)
  })
})

describe('chatCompletion / 聊天完成', () => {
  it('returns the assistant text / 回傳助理文字', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ choices: [{ message: { content: 'hi' } }] }), { status: 200 })),
    )
    const text = await chatCompletion({ baseUrl: 'http://x/v1', model: 'm' }, [
      { role: 'user', content: 'hello' },
    ])
    expect(text).toBe('hi')
  })

  it('throws invalid on an HTTP error / HTTP 錯誤時丟 invalid', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ error: { message: 'bad model' } }), { status: 400 })),
    )
    await expect(chatCompletion({ baseUrl: 'http://x/v1', model: 'm' }, [{ role: 'user', content: 'x' }])).rejects.toMatchObject({
      code: 'invalid',
    })
  })
})

describe('suggestions / 建議', () => {
  it('builds a prompt carrying the page facts / 提示包含頁面資訊', () => {
    const [system, user] = buildSuggestMessages({
      url: 'https://example.com/a',
      language: 'en',
      title: 'Old',
      description: null,
      h1: ['Heading'],
      wordCount: 300,
      issues: ['Missing description'],
      keywords: ['widget'],
    })
    expect(system.content).toContain('JSON')
    expect(String(user.content)).toContain('https://example.com/a')
    expect(String(user.content)).toContain('Missing description')
  })

  it('coerces a partial answer / 補齊缺漏欄位', () => {
    expect(parseSuggestion({ title: ' T ', notes: ['a', 2, 'b'] })).toEqual({
      title: 'T',
      description: '',
      notes: ['a', 'b'],
    })
  })

  it('sends and parses through chatCompletion / 走 chatCompletion 並解析', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            choices: [{ message: { content: '{"title":"New","description":"Desc","notes":["x"]}' } }],
          }),
          { status: 200 },
        ),
      ),
    )
    const suggestion = await suggestSeoFields(
      { baseUrl: 'http://x/v1', model: 'm' },
      { url: 'https://e.com', language: 'en', title: null, description: null, h1: [], wordCount: 0, issues: [], keywords: [] },
    )
    expect(suggestion).toEqual({ title: 'New', description: 'Desc', notes: ['x'] })
  })
})

describe('vision / 視覺', () => {
  it('attaches the image as a data URL / 以 data URL 附上圖片', () => {
    const messages = buildVisionMessages('data:image/png;base64,AAA')
    const content = messages[0].content
    expect(Array.isArray(content)).toBe(true)
    expect(JSON.stringify(content)).toContain('data:image/png;base64,AAA')
  })

  it('parses a results list / 解析結果清單', () => {
    expect(
      parseVisionSerp({ results: [{ position: 1, url: 'https://a.com/', title: 'A' }, { url: '' }] }),
    ).toEqual([{ position: 1, url: 'https://a.com/', title: 'A' }])
  })

  it('returns [] for an unexpected shape / 形狀不符時回空陣列', () => {
    expect(parseVisionSerp({ nope: true })).toEqual([])
  })
})