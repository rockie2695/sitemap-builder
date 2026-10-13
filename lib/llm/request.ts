/**
 * Client helper for the LLM suggestion endpoint.
 *
 * 建議端點的客戶端輔助。
 */
import { suggestResponseSchema } from './schema'

/** Endpoint that asks the model for a rewrite. */
export const SUGGEST_ENDPOINT = '/api/seo/suggest'

/** Body sent to the endpoint. */
export interface SuggestRequest {
  url: string
  language: string
  title: string | null
  description: string | null
  h1: string[]
  wordCount: number
  issues: string[]
  keywords: string[]
  /** Optional endpoint override; the key stays server-side. */
  baseUrl?: string
  model?: string
}

/** A successful suggestion. */
export interface Suggestion {
  title: string
  description: string
  notes: string[]
  model?: string
}

/** Outcome of a suggestion request. */
export type SuggestResult =
  | { ok: true; suggestion: Suggestion }
  | { ok: false; message: string; code?: string }

/**
 * Ask the server for a rewrite.
 *
 * @param body   Page facts + optional endpoint override.
 * @param signal Abort signal.
 */
export async function requestSuggestion(
  body: SuggestRequest,
  signal?: AbortSignal,
): Promise<SuggestResult> {
  let response: Response
  try {
    response = await fetch(SUGGEST_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal,
    })
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error
    return { ok: false, message: error instanceof Error ? error.message : String(error) }
  }

  const parsed = suggestResponseSchema.safeParse(await response.json().catch(() => undefined))
  if (!parsed.success) {
    return { ok: false, message: `服务端返回了无法解析的响应（HTTP ${response.status}）` }
  }
  if (parsed.data.errorCode) {
    return { ok: false, message: parsed.data.error ?? '', code: parsed.data.errorCode }
  }
  const { title, description, notes, model } = parsed.data
  return { ok: true, suggestion: { title, description, notes, model } }
}