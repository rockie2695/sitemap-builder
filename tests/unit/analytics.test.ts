/**
 * Unit tests for the GA4 client (service-account JWT + report mapping).
 *
 * The RSA key is generated at runtime and a real temp file is used, so the whole flow —
 * key parsing, JWT signing, token exchange, report call — runs against a mocked `fetch`.
 *
 * GA4 客戶端的單元測試（服務帳戶 JWT ＋報表映射）。金鑰於執行期產生並使用真實暫存檔，
 * 因此整條流程（解析金鑰、簽 JWT、換 token、呼叫報表）都能以 mock 的 `fetch` 驗證。
 */
import { generateKeyPairSync } from 'node:crypto'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'

import { Ga4Error, buildJwtAssertion, ga4ErrorCode, parseServiceAccount, runGa4Report, toGa4Path } from '@/lib/analytics/ga4'

const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 })
const PEM = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString()

const dir = mkdtempSync(join(tmpdir(), 'smb-ga4-'))
const credPath = join(dir, 'service-account.json')
writeFileSync(
  credPath,
  JSON.stringify({
    client_email: 'svc@example.iam.gserviceaccount.com',
    private_key: PEM,
    token_uri: 'https://oauth2.googleapis.com/token',
  }),
)

afterAll(() => rmSync(dir, { recursive: true, force: true }))
beforeEach(() => vi.restoreAllMocks())

const ACCOUNT = {
  client_email: 'svc@example.iam.gserviceaccount.com',
  private_key: PEM,
  token_uri: 'https://oauth2.googleapis.com/token',
}

describe('parseServiceAccount / 解析服務帳戶', () => {
  it('reads the fields and unescapes newlines / 讀取欄位並還原換行', () => {
    const account = parseServiceAccount(JSON.stringify({ ...ACCOUNT, private_key: PEM.replace(/\n/g, '\\n') }))
    expect(account.client_email).toBe(ACCOUNT.client_email)
    expect(account.private_key).toContain('BEGIN PRIVATE KEY')
    expect(account.private_key).toContain('\n')
  })

  it('rejects malformed JSON and missing fields / 拒絕畸形與缺欄位', () => {
    expect(() => parseServiceAccount('{nope')).toThrow(Ga4Error)
    expect(() => parseServiceAccount(JSON.stringify({ client_email: 'x' }))).toThrow(Ga4Error)
  })
})

describe('buildJwtAssertion / 建立 JWT', () => {
  it('produces a signed three-part JWT with the RS256 header / 產生三段式 RS256 JWT', () => {
    const jwt = buildJwtAssertion(ACCOUNT, 1_700_000_000)
    const [header, claim, signature] = jwt.split('.')
    expect(signature.length).toBeGreaterThan(0)
    expect(JSON.parse(Buffer.from(header, 'base64url').toString())).toEqual({ alg: 'RS256', typ: 'JWT' })
    expect(JSON.parse(Buffer.from(claim, 'base64url').toString())).toMatchObject({
      iss: ACCOUNT.client_email,
      aud: ACCOUNT.token_uri,
      iat: 1_700_000_000,
      exp: 1_700_003_600,
    })
  })
})

describe('toGa4Path / 路徑正規化', () => {
  it('keeps the pathname of a URL and a bare path / 保留 URL 的路徑與裸路徑', () => {
    expect(toGa4Path('https://x.com/a/b?q=1')).toBe('/a/b')
    expect(toGa4Path('a/b')).toBe('/a/b')
    expect(toGa4Path('/a/b')).toBe('/a/b')
  })
})

describe('ga4ErrorCode / 錯誤代碼', () => {
  it('reads a Ga4Error and a plain coded error / 讀取 Ga4Error 與一般帶碼錯誤', () => {
    expect(ga4ErrorCode(new Ga4Error('auth', 'x'))).toBe('auth')
    expect(ga4ErrorCode(Object.assign(new Error('x'), { code: 'network' }))).toBe('network')
  })

  it('falls back to network / 其他情況回 network', () => {
    expect(ga4ErrorCode(new Error('x'))).toBe('network')
    expect(ga4ErrorCode('boom')).toBe('network')
  })
})

describe('runGa4Report / 執行報表', () => {
  it('authenticates then maps rows / 先驗證再映射列', async () => {
    let reportInit: RequestInit | undefined
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      if (url.includes('oauth2')) {
        return new Response(JSON.stringify({ access_token: 'tok' }), { status: 200 })
      }
      reportInit = init
      return new Response(
        JSON.stringify({
          rows: [
            { dimensionValues: [{ value: '/a' }], metricValues: [{ value: '120' }, { value: '80' }] },
            { dimensionValues: [{ value: '/b' }], metricValues: [{ value: '5' }, { value: '3' }] },
          ],
        }),
        { status: 200 },
      )
    })
    vi.stubGlobal('fetch', fetchMock)

    const rows = await runGa4Report({ propertyId: '123', credentialsPath: credPath, paths: ['/a', '/b'] })
    expect(rows).toEqual([
      { path: '/a', pageViews: 120, sessions: 80 },
      { path: '/b', pageViews: 5, sessions: 3 },
    ])

    // The report call carries the path filter and a bearer token.
    expect(fetchMock.mock.calls.some((call) => String(call[0]).includes('runReport'))).toBe(true)
    const body = JSON.parse(reportInit?.body as string)
    expect(body.dimensionFilter.filter.inListFilter.values).toEqual(['/a', '/b'])
    expect(reportInit?.headers).toMatchObject({ Authorization: 'Bearer tok' })
  })

  it('throws no_credentials when config is missing / 缺少設定時丟出 no_credentials', async () => {
    await expect(runGa4Report({ propertyId: '', credentialsPath: '', paths: ['/a'] })).rejects.toMatchObject({
      code: 'no_credentials',
    })
  })
})