/**
 * `POST /api/analytics` — fetch GA4 traffic for a set of page paths.
 *
 * Credentials live server-side (`GA4_PROPERTY_ID`, `GOOGLE_APPLICATION_CREDENTIALS`); the
 * browser only sends the paths it wants numbers for.
 *
 * `POST /api/analytics` — 為一組頁面路徑取得 GA4 流量。
 * 憑證只存在伺服器端（`GA4_PROPERTY_ID`、`GOOGLE_APPLICATION_CREDENTIALS`）；
 * 瀏覽器只送出想查的路徑。
 */
import { NextResponse } from 'next/server'

import { formatZodError } from '@/lib/crawler/schema'
import { ga4ErrorCode, runGa4Report, type Ga4ErrorCode } from '@/lib/analytics/ga4'
import { analyticsRequestSchema } from '@/lib/analytics/schema'
import type { AnalyticsResponsePayload } from '@/lib/analytics/schema'

/** Needs Node for `node:crypto` / `node:fs`. */
export const runtime = 'nodejs'
/** Talks to Google; never cache. */
export const dynamic = 'force-dynamic'

/** HTTP status per failure kind. */
const STATUS_BY_CODE: Record<Ga4ErrorCode, number> = {
  no_credentials: 400,
  invalid: 400,
  auth: 502,
  network: 502,
}

/** Build a complete error body. */
function errorBody(code: Ga4ErrorCode, message: string): AnalyticsResponsePayload {
  return { rows: [], error: message, errorCode: code }
}

/** Handler for the analytics endpoint. */
export async function POST(request: Request): Promise<NextResponse> {
  let raw: unknown
  try {
    raw = await request.json()
  } catch {
    return NextResponse.json(errorBody('invalid', '请求体不是合法的 JSON'), { status: 400 })
  }

  const parsed = analyticsRequestSchema.safeParse(raw)
  if (!parsed.success) {
    return NextResponse.json(errorBody('invalid', formatZodError(parsed.error)), { status: 400 })
  }

  try {
    const rows = await runGa4Report({
      propertyId: process.env.GA4_PROPERTY_ID ?? '',
      credentialsPath: process.env.GOOGLE_APPLICATION_CREDENTIALS ?? '',
      paths: parsed.data.paths,
      days: parsed.data.days,
      signal: request.signal,
    })
    return NextResponse.json({ rows })
  } catch (error) {
    const code = ga4ErrorCode(error)
    const message = error instanceof Error ? error.message : String(error)
    return NextResponse.json(errorBody(code, message), { status: STATUS_BY_CODE[code] })
  }
}