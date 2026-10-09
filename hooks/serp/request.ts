/**
 * HTTP layer for the SERP API.
 *
 * Always resolves to a validated `SerpResponse`: transport and parse failures are
 * folded into the same shape with a `network` error code, so the engine loop never has
 * to branch on exceptions.
 *
 * SERP API 的 HTTP 層。永遠回傳通過驗證的 `SerpResponse`：
 * 連線與解析失敗都會折疊成相同形狀並標上 `network`，引擎迴圈因此不必處理例外分支。
 */
import { serpResponseSchema } from '@/lib/serp/schema'
import type { SerpQuery, SerpRequest, SerpResponse } from '@/types/serp'

/** Endpoint that reads one search-engine result page server-side. */
export const SERP_ENDPOINT = '/api/serp'

/** A response carrying only an error. */
function failure(query: string, message: string): SerpResponse {
  return {
    query,
    engine: 'google',
    provider: 'playwright',
    rank: null,
    results: [],
    competitors: [],
    error: message,
    errorCode: 'network',
  }
}

/**
 * Ask the server to read the SERP for one query.
 *
 * @param entry  The derived query plus the page it targets.
 * @param body   Engine / provider / analysis settings.
 * @param signal Abort signal; aborting rejects with an `AbortError`.
 */
export async function requestSerp(
  entry: SerpQuery,
  body: Omit<SerpRequest, 'query' | 'targetUrl'>,
  signal: AbortSignal,
): Promise<SerpResponse> {
  const request: SerpRequest = { query: entry.query, targetUrl: entry.url, ...body }

  let response: Response
  try {
    response = await fetch(SERP_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(request),
      signal,
    })
  } catch (error) {
    // Abort must bubble so the engine can stop cleanly.
    if (error instanceof DOMException && error.name === 'AbortError') throw error
    return failure(entry.query, error instanceof Error ? error.message : String(error))
  }

  const payload: unknown = await response.json().catch(() => undefined)
  const parsed = serpResponseSchema.safeParse(payload)
  if (!parsed.success) {
    return failure(entry.query, `服务端返回了无法解析的响应（HTTP ${response.status}）`)
  }
  return parsed.data
}