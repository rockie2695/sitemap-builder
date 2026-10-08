/**
 * `POST /api/crawl` — open one page server-side and return its in-scope links.
 *
 * This file is intentionally thin: validate the body, apply the SSRF policy, hand
 * the work to `crawlPage()`, and map the result onto HTTP.
 *
 * `POST /api/crawl` — 在伺服器端開啟單頁並回傳範圍內的連結。
 * 這個檔案刻意保持單純：驗證請求、套用 SSRF 政策、把工作交給 `crawlPage()`、
 * 再把結果映射成 HTTP 回應。
 */
import { NextResponse } from 'next/server'

import { crawlPage } from '@/lib/crawler/crawlPage'
import { crawlRequestSchema, formatZodError } from '@/lib/crawler/schema'
import type { CrawlResponsePayload } from '@/lib/crawler/schema'
import { assertAllowedTarget } from '@/lib/ssrf'

/** Must run on Node: we launch a real browser. */
export const runtime = 'nodejs'
/** Vercel function budget (Pro plan). */
export const maxDuration = 60
/** Every request performs a real fetch; never cache it. */
export const dynamic = 'force-dynamic'

/**
 * Build a complete error payload.
 *
 * The shape always matches `crawlResponseSchema` so the browser can surface
 * `error` instead of a generic "unparseable response" message.
 */
function errorPayload(url: string, message: string): CrawlResponsePayload {
  return {
    links: [],
    skippedLinks: 0,
    pageUrl: url,
    finalUrl: url,
    pageTitle: null,
    httpStatus: null,
    lastModified: null,
    durationMs: 0,
    error: message,
  }
}

/** Handler for the crawl endpoint. */
export async function POST(request: Request): Promise<NextResponse> {
  // ---- Body validation (zod) ----
  let raw: unknown
  try {
    raw = await request.json()
  } catch {
    const payload = errorPayload('', '请求体不是合法的 JSON')
    return NextResponse.json(payload, { status: 400 })
  }

  const parsed = crawlRequestSchema.safeParse(raw)
  if (!parsed.success) {
    const payload = errorPayload('', formatZodError(parsed.error))
    return NextResponse.json(payload, { status: 400 })
  }

  const { url, origin, pathPrefix, stripQuery } = parsed.data

  // ---- SSRF policy ----
  try {
    assertAllowedTarget(new URL(url))
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return NextResponse.json(errorPayload(url, message), { status: 400 })
  }

  // ---- Fetch ----
  const { status, payload } = await crawlPage({
    url,
    origin,
    pathPrefix,
    stripQuery,
    signal: request.signal,
  })

  return NextResponse.json(payload, { status })
}