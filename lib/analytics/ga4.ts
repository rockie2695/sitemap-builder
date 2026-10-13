/**
 * GA4 Data API client (zero dependency).
 *
 * Authenticates with a Google **service account**: build a signed JWT, exchange it for an
 * access token, then call `properties/{id}:runReport`. This is the same flow
 * `@google-analytics/data` wraps; doing it with `node:crypto` keeps the app dependency-free.
 *
 * Env: `GA4_PROPERTY_ID` (numeric property id) and `GOOGLE_APPLICATION_CREDENTIALS`
 * (path to the service-account JSON).
 *
 * GA4 Data API 客戶端（零相依）。以 Google **服務帳戶**驗證：簽 JWT、換 access token、
 * 再呼叫 `properties/{id}:runReport`。這與 `@google-analytics/data` 包裝的流程相同，
 * 但用 `node:crypto` 自行實作，讓專案不需要額外相依。
 *
 * 環境變數：`GA4_PROPERTY_ID`（資源編號）與 `GOOGLE_APPLICATION_CREDENTIALS`（服務帳戶 JSON 路徑）。
 */
import { createSign } from 'node:crypto'
import { readFile } from 'node:fs/promises'

/** Machine-readable failure kinds. */
export type Ga4ErrorCode = 'no_credentials' | 'auth' | 'network' | 'invalid'

/** A typed GA4 failure. */
export class Ga4Error extends Error {
  constructor(
    readonly code: Ga4ErrorCode,
    message: string,
  ) {
    super(message)
    this.name = 'Ga4Error'
  }
}

/** The fields we read from a service-account JSON key. */
export interface ServiceAccount {
  client_email: string
  private_key: string
  token_uri: string
}

/** One row of the report. */
export interface Ga4Row {
  /** `pagePath` as GA4 reports it (may include a query string). */
  path: string
  pageViews: number
  sessions: number
}

/** Options for {@link runGa4Report}. */
export interface RunGa4Options {
  propertyId: string
  credentialsPath: string
  /** Paths to fetch (leading slash, no origin). Empty = all pages. */
  paths: readonly string[]
  /** Look-back window in days (default 28). */
  days?: number
  signal?: AbortSignal
}

/** OAuth token endpoint used when the key does not name one. */
const DEFAULT_TOKEN_URI = 'https://oauth2.googleapis.com/token'
/** Read-only Analytics scope. */
const SCOPE = 'https://www.googleapis.com/auth/analytics.readonly'
/** GA4 Data API version root. */
const DATA_API = 'https://analyticsdata.googleapis.com/v1beta'
/** Safety cap on returned rows. */
const ROW_LIMIT = 10_000

/**
 * Parse and validate a service-account JSON key.
 *
 * @param json Raw file contents.
 * @throws {Ga4Error} When the key is malformed or missing fields.
 */
export function parseServiceAccount(json: string): ServiceAccount {
  let parsed: unknown
  try {
    parsed = JSON.parse(json)
  } catch {
    throw new Ga4Error('invalid', '服务账号 JSON 无法解析')
  }

  const record = parsed as Record<string, unknown>
  const email = record.client_email
  const key = record.private_key
  if (typeof email !== 'string' || typeof key !== 'string' || !email || !key) {
    throw new Ga4Error('invalid', '服务账号缺少 client_email / private_key')
  }

  const tokenUri = typeof record.token_uri === 'string' && record.token_uri ? record.token_uri : DEFAULT_TOKEN_URI
  // A JSON key often stores the PEM with literal `\n` sequences.
  return { client_email: email, private_key: key.replace(/\\n/g, '\n'), token_uri: tokenUri }
}

/** Base64url-encode a JSON value. */
function base64url(value: object): string {
  return Buffer.from(JSON.stringify(value)).toString('base64url')
}

/**
 * Build the signed JWT assertion for the service account.
 *
 * @param account Service account.
 * @param now     Unix seconds (injectable for tests).
 */
export function buildJwtAssertion(account: ServiceAccount, now: number): string {
  const header = base64url({ alg: 'RS256', typ: 'JWT' })
  const claim = base64url({
    iss: account.client_email,
    scope: SCOPE,
    aud: account.token_uri,
    iat: now,
    exp: now + 3600,
  })
  const unsigned = `${header}.${claim}`

  const signer = createSign('RSA-SHA256')
  signer.update(unsigned)
  signer.end()
  const signature = signer.sign(account.private_key, 'base64url')

  return `${unsigned}.${signature}`
}

/**
 * Exchange the JWT for an access token.
 *
 * @throws {Ga4Error} `auth` on any non-2xx response.
 */
async function fetchAccessToken(account: ServiceAccount, signal?: AbortSignal): Promise<string> {
  const assertion = buildJwtAssertion(account, Math.floor(Date.now() / 1000))
  const body = new URLSearchParams({
    grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
    assertion,
  })

  let response: Response
  try {
    response = await fetch(account.token_uri, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
      signal,
    })
  } catch (error) {
    throw new Ga4Error('network', error instanceof Error ? error.message : String(error))
  }

  const payload = (await response.json().catch(() => ({}))) as { access_token?: string; error_description?: string }
  if (!response.ok || !payload.access_token) {
    throw new Ga4Error('auth', payload.error_description ?? `令牌请求失败（HTTP ${response.status}）`)
  }
  return payload.access_token
}

/** Normalize a path for the GA4 dimension filter (leading slash, no origin). */
export function toGa4Path(pathOrUrl: string): string {
  try {
    const url = new URL(pathOrUrl)
    return url.pathname || '/'
  } catch {
    const trimmed = pathOrUrl.trim()
    if (!trimmed) return '/'
    return trimmed.startsWith('/') ? trimmed : `/${trimmed}`
  }
}

/**
 * Resolve the machine code from any thrown value.
 *
 * Tolerant of a plain error carrying a `code` field, so it works across module
 * boundaries (e.g. a mocked/faked client in tests) as well as real {@link Ga4Error}s.
 *
 * 從任何被丟出的值解析出機器可讀代碼。容忍帶有 `code` 欄位的一般 Error，
 * 因此能跨模組邊界（例如測試中的假客戶端）與真正的 {@link Ga4Error} 一併運作。
 */
export function ga4ErrorCode(error: unknown): Ga4ErrorCode {
  if (error instanceof Ga4Error) return error.code
  const code = (error as { code?: unknown } | null)?.code
  switch (code) {
    case 'no_credentials':
    case 'auth':
    case 'network':
    case 'invalid':
      return code
    default:
      return 'network'
  }
}

/**
 * Run a `pagePath` × `screenPageViews`/`sessions` report.
 *
 * @throws {Ga4Error} With a machine-readable code.
 */
export async function runGa4Report(options: RunGa4Options): Promise<Ga4Row[]> {
  if (!options.propertyId || !options.credentialsPath) {
    throw new Ga4Error('no_credentials', '未设置 GA4_PROPERTY_ID 或 GOOGLE_APPLICATION_CREDENTIALS')
  }

  let json: string
  try {
    json = await readFile(options.credentialsPath, 'utf8')
  } catch {
    throw new Ga4Error('no_credentials', `无法读取凭据文件：${options.credentialsPath}`)
  }

  const account = parseServiceAccount(json)
  const token = await fetchAccessToken(account, options.signal)

  const request: Record<string, unknown> = {
    dateRanges: [{ startDate: `${options.days ?? 28}daysAgo`, endDate: 'today' }],
    dimensions: [{ name: 'pagePath' }],
    metrics: [{ name: 'screenPageViews' }, { name: 'sessions' }],
    limit: ROW_LIMIT,
  }

  const paths = options.paths.map(toGa4Path).filter(Boolean)
  if (paths.length > 0) {
    request.dimensionFilter = {
      filter: { fieldName: 'pagePath', inListFilter: { values: paths, caseSensitive: true } },
    }
  }

  let response: Response
  try {
    response = await fetch(`${DATA_API}/properties/${options.propertyId}:runReport`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(request),
      signal: options.signal,
    })
  } catch (error) {
    throw new Ga4Error('network', error instanceof Error ? error.message : String(error))
  }

  const payload = (await response.json().catch(() => ({}))) as {
    rows?: Array<{ dimensionValues?: Array<{ value: string }>; metricValues?: Array<{ value: string }> }>
    error?: { message?: string }
  }

  if (!response.ok) {
    throw new Ga4Error('auth', payload.error?.message ?? `GA4 请求失败（HTTP ${response.status}）`)
  }

  return (payload.rows ?? []).map((row) => ({
    path: row.dimensionValues?.[0]?.value ?? '',
    pageViews: Number(row.metricValues?.[0]?.value ?? 0),
    sessions: Number(row.metricValues?.[1]?.value ?? 0),
  }))
}