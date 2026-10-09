/**
 * `POST /api/serp` — read one search-engine result page and rank our URL in it.
 *
 * Opt-in and deliberately conservative: one query per call (the browser-side queue
 * enforces the interval), and the response carries a machine-readable `errorCode` so
 * the UI can auto-pause when the engine blocks us.
 *
 * `POST /api/serp` — 讀取一個搜尋結果頁並為我們的網址排名。
 * 屬於選用且刻意保守：每次呼叫只查一個關鍵詞（間隔由前端佇列控制），
 * 回應帶有機器可讀的 `errorCode`，讓介面在引擎封鎖時能自動暫停。
 */
import { NextResponse } from 'next/server'

import { formatZodError } from '@/lib/crawler/schema'
import { SerpError, fetchSerp } from '@/lib/serp/provider'
import { serpRequestSchema } from '@/lib/serp/schema'
import { assertAllowedTarget } from '@/lib/ssrf'
import type { SerpCompetitor, SerpErrorCode, SerpResponse } from '@/types/serp'

/** Needs Node: we drive Chromium. */
export const runtime = 'nodejs'
/** Vercel function budget (Pro plan): one SERP page plus a few competitors. */
export const maxDuration = 60
/** Always live; never cache. */
export const dynamic = 'force-dynamic'

/** HTTP status per failure kind. */
const STATUS_BY_CODE: Record<SerpErrorCode, number> = {
  invalid: 400,
  no_key: 400,
  blocked: 502,
  empty: 502,
  network: 502,
}

/** Build a complete error body matching `serpResponseSchema`. */
function errorBody(query: string, code: SerpErrorCode, message: string): SerpResponse {
  return {
    query,
    engine: 'google',
    provider: 'playwright',
    rank: null,
    results: [],
    competitors: [],
    error: message,
    errorCode: code,
  }
}

/** Handler for the SERP endpoint. */
export async function POST(request: Request): Promise<NextResponse> {
  let raw: unknown
  try {
    raw = await request.json()
  } catch {
    return NextResponse.json(errorBody('', 'invalid', '请求体不是合法的 JSON'), { status: 400 })
  }

  const parsed = serpRequestSchema.safeParse(raw)
  if (!parsed.success) {
    return NextResponse.json(errorBody('', 'invalid', formatZodError(parsed.error)), { status: 400 })
  }

  const { query, targetUrl, engine, provider, analyzeTop } = parsed.data

  try {
    const result = await fetchSerp({
      query,
      targetUrl,
      engine,
      provider,
      analyzeTop,
      signal: request.signal,
      // Apply the same SSRF policy to competitor pages as to any other target.
      analyze: async (url, signal): Promise<SerpCompetitor> => {
        try {
          assertAllowedTarget(new URL(url))
        } catch (error) {
          return {
            url,
            title: null,
            titleLength: 0,
            descriptionLength: 0,
            h1Count: 0,
            wordCount: 0,
            structuredData: [],
            error: error instanceof Error ? error.message : String(error),
          }
        }
        const { analyzeCompetitorPage } = await import('@/lib/serp/competitor')
        return analyzeCompetitorPage(url, signal)
      },
    })

    const payload: SerpResponse = {
      query,
      engine,
      provider: result.provider,
      rank: result.rank,
      results: result.results,
      competitors: result.competitors,
    }
    return NextResponse.json(payload)
  } catch (error) {
    const code: SerpErrorCode = error instanceof SerpError ? error.code : 'network'
    const message = error instanceof Error ? error.message : String(error)
    return NextResponse.json(errorBody(query, code, message), { status: STATUS_BY_CODE[code] })
  }
}