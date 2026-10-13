/**
 * `POST /api/seo/suggest` — ask an OpenAI-compatible model to rewrite a page's title and
 * meta description.
 *
 * The endpoint (base URL / model) can come from the request or the environment; the API
 * key is **only** read from `LLM_API_KEY` on the server and is never echoed back.
 *
 * `POST /api/seo/suggest` — 請 OpenAI 相容模型改寫頁面的標題與 meta 描述。
 * 端點（base URL／模型）可來自請求或環境變數；API 金鑰**只**從伺服器端的 `LLM_API_KEY` 讀取，
 * 也絕不回傳。
 */
import { NextResponse } from 'next/server'

import { formatZodError } from '@/lib/crawler/schema'
import { LlmError, resolveLlmConfig, type LlmErrorCode } from '@/lib/llm/openai'
import { suggestRequestSchema, suggestResponseSchema } from '@/lib/llm/schema'
import type { SuggestResponsePayload } from '@/lib/llm/schema'
import { suggestSeoFields } from '@/lib/llm/suggest'

/** Uses `fetch` only; Node is fine and keeps parity with the other routes. */
export const runtime = 'nodejs'
/** Talks to a model; never cache. */
export const dynamic = 'force-dynamic'

/** HTTP status per failure kind. */
const STATUS_BY_CODE: Record<LlmErrorCode, number> = {
  no_config: 400,
  invalid: 400,
  network: 502,
  empty: 502,
}

/** Build a complete error body. */
function errorBody(code: LlmErrorCode, message: string): SuggestResponsePayload {
  return { title: '', description: '', notes: [], error: message, errorCode: code }
}

/** Handler for the suggestion endpoint. */
export async function POST(request: Request): Promise<NextResponse> {
  let raw: unknown
  try {
    raw = await request.json()
  } catch {
    return NextResponse.json(errorBody('invalid', '请求体不是合法的 JSON'), { status: 400 })
  }

  const parsed = suggestRequestSchema.safeParse(raw)
  if (!parsed.success) {
    return NextResponse.json(errorBody('invalid', formatZodError(parsed.error)), { status: 400 })
  }

  const config = resolveLlmConfig({ baseUrl: parsed.data.baseUrl, model: parsed.data.model })
  if (!config) {
    return NextResponse.json(
      errorBody('no_config', '未设置 LLM 端点：请填写 base URL 与模型，或设置 LLM_BASE_URL / LLM_MODEL'),
      { status: 400 },
    )
  }

  const { data } = parsed
  const input = {
    url: data.url,
    language: data.language,
    title: data.title,
    description: data.description,
    h1: data.h1,
    wordCount: data.wordCount,
    issues: data.issues,
    keywords: data.keywords,
  }

  try {
    const suggestion = await suggestSeoFields(config, input, request.signal)
    return NextResponse.json(suggestResponseSchema.parse({ ...suggestion, model: config.model }))
  } catch (error) {
    const code: LlmErrorCode = error instanceof LlmError ? error.code : 'network'
    const message = error instanceof Error ? error.message : String(error)
    return NextResponse.json(errorBody(code, message), { status: STATUS_BY_CODE[code] })
  }
}