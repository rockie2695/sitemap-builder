/**
 * SERP fetching.
 *
 * Two backends behind one function:
 *
 * - `playwright` (default): opens the real search page in our shared Chromium and reads
 *   the organic results. Free, but **against Google's/Bing's terms** and frequently
 *   blocked — hence the rate limit and the explicit `blocked` error.
 * - `serpapi`: a paid JSON API (`SERPAPI_KEY`), used automatically by `auto` when the
 *   key is present.
 *
 * 兩種後端、一個入口：
 * - `playwright`（預設）：用共用的 Chromium 開啟真實搜尋頁並讀取自然結果。免費，
 *   但**違反 Google／Bing 條款**且經常被封鎖——因此有限速與明確的 `blocked` 錯誤。
 * - `serpapi`：付費 JSON API（`SERPAPI_KEY`）；`auto` 在偵測到 key 時自動使用。
 */
import type { Page } from 'playwright'

import { getBrowser } from '@/lib/browser'
import { resolveVisionConfig } from '@/lib/llm/openai'
import { readSerpFromScreenshot } from '@/lib/llm/vision'
import type { SerpCompetitor, SerpEngine, SerpErrorCode, SerpProviderId, SerpResult } from '@/types/serp'
import { SERP_RESULT_LIMIT } from '@/types/serp'

import { analyzeCompetitorPage } from './competitor'
import { buildSerpUrl, collectSerpResults, detectSerpBlock } from './extract'
import { dedupeResults, findRank, pickCompetitors } from './rank'

/** Hostname of a URL, or an empty string when it is unparseable. */
function safeHostname(url: string): string {
  try {
    return new URL(url).hostname
  } catch {
    return ''
  }
}

/** A normal Chrome UA: search pages refuse unknown agents. */
const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'

/**
 * Injected before any page script: mask the most common headless-automation tells that
 * trigger consent/CAPTCHA walls. Best-effort — the IP reputation matters more.
 *
 * 在任何頁面指令碼之前注入：遮蔽最常見的無頭自動化特徵（會觸發同意／CAPTCHA 畫面）。
 * 只是盡力而為——IP 信譽的影響更大。
 */
const STEALTH_SCRIPT = `
Object.defineProperty(navigator, 'webdriver', { get: () => false });
if (!window.chrome) { window.chrome = {}; }
if (!window.chrome.runtime) { window.chrome.runtime = {}; }
Object.defineProperty(navigator, 'languages', { get: () => ['en-US', 'en'] });
Object.defineProperty(navigator, 'plugins', { get: () => [1, 2, 3, 4, 5] });
`

/**
 * Google consent cookies: pre-accepting the consent screen avoids the "Before you
 * continue" wall that otherwise looks like a block. Best-effort.
 *
 * Google 同意 cookie：預先同意可避開「Before you continue」同意畫面（否則看起來像被封鎖）。
 */
const GOOGLE_CONSENT_COOKIES = [
  {
    name: 'SOCS',
    value: 'CAISNQgQEitib3FfaWRlbnRpdHlmcm9udGVuZHVpc2VydmVyXzIwMjMxMTE1LjA4X3AwGgJlbiACGgYIgLC_pwY',
    domain: '.google.com',
    path: '/',
  },
  { name: 'CONSENT', value: 'YES+cb.20230101-00-p0.en+FX+000', domain: '.google.com', path: '/' },
]

/** Navigation timeout for a search page. */
const NAV_TIMEOUT = 20_000

/** A typed failure the UI can react to. */
export class SerpError extends Error {
  constructor(
    /** Machine-readable kind. */
    readonly code: SerpErrorCode,
    message: string,
  ) {
    super(message)
    this.name = 'SerpError'
  }
}

/** Options for {@link fetchSerp}. */
export interface FetchSerpOptions {
  query: string
  /** Our page, used to compute the rank. */
  targetUrl: string
  engine: SerpEngine
  provider: SerpProviderId
  /** How many competitors to analyse on-page. */
  analyzeTop: number
  locale?: string
  signal?: AbortSignal
  /** Injectable analyser (tests pass a stub). */
  analyze?: (url: string, signal?: AbortSignal) => Promise<SerpCompetitor>
}

/** Result of one SERP lookup. */
export interface FetchSerpResult {
  /** Backend that answered. */
  provider: Exclude<SerpProviderId, 'auto'>
  rank: number | null
  results: SerpResult[]
  competitors: SerpCompetitor[]
}

/** Resolve `auto` to a concrete backend based on the environment. */
export function resolveProvider(provider: SerpProviderId): Exclude<SerpProviderId, 'auto'> {
  if (provider === 'serpapi') return 'serpapi'
  if (provider === 'playwright') return 'playwright'
  return process.env.SERPAPI_KEY ? 'serpapi' : 'playwright'
}

/**
 * Run one SERP lookup.
 *
 * @throws {SerpError} With a `blocked` / `empty` / `no_key` / `network` code.
 */
export async function fetchSerp(options: FetchSerpOptions): Promise<FetchSerpResult> {
  const provider = resolveProvider(options.provider)

  const rawResults =
    provider === 'serpapi'
      ? await fetchFromSerpApi(options)
      : await fetchFromPlaywright(options)

  const results = dedupeResults(rawResults).slice(0, SERP_RESULT_LIMIT)

  if (results.length === 0) {
    throw new SerpError('empty', 'No organic results could be extracted from the search page')
  }

  const analyze = options.analyze ?? analyzeCompetitorPage
  const competitors: SerpCompetitor[] = []
  for (const competitor of pickCompetitors(results, options.targetUrl, options.analyzeTop)) {
    if (options.signal?.aborted) break
    competitors.push(await analyze(competitor.url, options.signal))
  }

  return { provider, rank: findRank(results, options.targetUrl), results, competitors }
}

/** Open the search page in Chromium and read the organic results. */
async function fetchFromPlaywright(options: FetchSerpOptions): Promise<SerpResult[]> {
  let context: Awaited<ReturnType<Awaited<ReturnType<typeof getBrowser>>['newContext']>> | undefined
  let page: Page | undefined

  try {
    const browser = await getBrowser()
    context = await browser.newContext({
      userAgent: USER_AGENT,
      viewport: { width: 1365, height: 900 },
      locale: options.locale === 'zh' ? 'zh-CN' : 'en-US',
      timezoneId: 'America/New_York',
    })
    // Stealth: mask automation signals and pre-accept the consent screen (best-effort).
    await context.addInitScript({ content: STEALTH_SCRIPT })
    await context.setExtraHTTPHeaders({
      'Accept-Language': options.locale === 'zh' ? 'zh-CN,zh;q=0.9,en;q=0.8' : 'en-US,en;q=0.9',
    })
    if (options.engine === 'google') {
      await context.addCookies(GOOGLE_CONSENT_COOKIES).catch(() => undefined)
    }
    page = await context.newPage()
    page.setDefaultNavigationTimeout(NAV_TIMEOUT)

    const onAbort = () => {
      if (page && !page.isClosed()) void page.close().catch(() => undefined)
    }
    options.signal?.addEventListener('abort', onAbort, { once: true })

    await page.goto(buildSerpUrl(options.engine, options.query, options.locale ?? 'en'), {
      waitUntil: 'domcontentloaded',
      timeout: NAV_TIMEOUT,
    })
    await page.waitForLoadState('networkidle', { timeout: 5_000 }).catch(() => undefined)

    const check = detectSerpBlock as unknown as () => string | null
    const blocked = await page.evaluate<string | null>(check)
    if (blocked) {
      throw new SerpError('blocked', `The search engine served a block page (matched “${blocked}”)`)
    }

    const collect = collectSerpResults as unknown as () => SerpResult[]
    const results = await page.evaluate<SerpResult[]>(collect)
    if (results.length > 0) return results

    // Nothing parsed: the markup may have changed. Optional vision fallback (opt-in via
    // LLM_BASE_URL + LLM_VISION_MODEL) reads the screenshot instead.
    const vision = resolveVisionConfig()
    if (vision) {
      try {
        const shot = await page.screenshot({ type: 'png' })
        const entries = await readSerpFromScreenshot(
          vision,
          Buffer.from(shot).toString('base64'),
          options.signal,
        )
        if (entries.length > 0) {
          return entries.map((entry, index) => ({
            position: entry.position || index + 1,
            url: entry.url,
            title: entry.title,
            hostname: safeHostname(entry.url),
          }))
        }
      } catch {
        // Fall through to the `empty` error below.
      }
    }

    return results
  } catch (error) {
    if (error instanceof SerpError) throw error
    throw new SerpError('network', error instanceof Error ? error.message.split('\n')[0] : String(error))
  } finally {
    await context?.close().catch(() => undefined)
  }
}

/** Call the paid SerpAPI backend. */
async function fetchFromSerpApi(options: FetchSerpOptions): Promise<SerpResult[]> {
  const key = process.env.SERPAPI_KEY
  if (!key) {
    throw new SerpError('no_key', 'SERPAPI_KEY is not configured')
  }

  const endpoint =
    `https://serpapi.com/search.json?engine=${options.engine === 'bing' ? 'bing' : 'google'}` +
    `&q=${encodeURIComponent(options.query)}&num=${SERP_RESULT_LIMIT}&api_key=${encodeURIComponent(key)}`

  const response = await fetch(endpoint, { signal: options.signal }).catch((error: unknown) => {
    throw new SerpError('network', error instanceof Error ? error.message : String(error))
  })

  if (!response.ok) {
    throw new SerpError('network', `SerpAPI responded with HTTP ${response.status}`)
  }

  const payload = (await response.json()) as {
    organic_results?: Array<{ link?: string; title?: string }>
    error?: string
  }

  if (payload.error) throw new SerpError('network', payload.error)

  return (payload.organic_results ?? [])
    .filter((entry) => typeof entry.link === 'string')
    .map((entry) => {
      const url = entry.link as string
      let hostname = ''
      try {
        hostname = new URL(url).hostname
      } catch {
        hostname = ''
      }
      return { position: 0, url, title: entry.title ?? '', hostname }
    })
}