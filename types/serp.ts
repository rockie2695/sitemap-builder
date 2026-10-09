/**
 * Search-engine result (SERP) types.
 *
 * Reading SERPs is opt-in: Google and Bing both block automated browsing and their
 * official search APIs are gone (Bing retired Aug 2025, Google CSE closed to new
 * customers). A paid provider can be dropped in when a key is configured.
 *
 * 搜尋結果（SERP）型別。讀取 SERP 是選用功能：Google 與 Bing 都會封鎖自動化瀏覽，
 * 而且官方搜尋 API 已停用（Bing 於 2025 年 8 月退役、Google CSE 不再接受新客戶）。
 * 若設定了付費 key，可切換到付費供應商。
 */

/** Which engine produced a result set. */
export type SerpEngine = 'google' | 'bing'

/** Which backend to use. `auto` prefers a configured paid API, else the browser. */
export type SerpProviderId = 'auto' | 'playwright' | 'serpapi'

/** One organic result. */
export interface SerpResult {
  /** 1-based position in the organic list. */
  position: number
  url: string
  title: string
  /** Hostname, for quick grouping. */
  hostname: string
}

/** On-page metrics of a competitor, collected with the SEO extractor. */
export interface SerpCompetitor {
  url: string
  title: string | null
  titleLength: number
  descriptionLength: number
  h1Count: number
  wordCount: number
  /** Structured-data `@type`s found on the competitor page. */
  structuredData: string[]
  error?: string
}

/**
 * Stored per page: the query it ranked for and the SERP around it.
 *
 * 每個頁面儲存：它對應的查詢與其周圍的 SERP。
 */
export interface SerpRecord {
  query: string
  engine: SerpEngine
  /** Which backend answered (`playwright` or `serpapi`). */
  provider: Exclude<SerpProviderId, 'auto'>
  checkedAt: number
  /** Position of our own page, or `null` when it was not in the top results. */
  rank: number | null
  /** Top organic results (capped). */
  results: SerpResult[]
  /** On-page metrics of the top competitors, when analysis was requested. */
  competitors: SerpCompetitor[]
}

/** A query derived from one of our pages. */
export interface SerpQuery {
  /** The query text sent to the search engine. */
  query: string
  /** The page it was derived from. */
  url: string
}

/** Request body for `POST /api/serp`. */
export interface SerpRequest {
  query: string
  /** Our own URL, used to compute the rank. */
  targetUrl: string
  engine: SerpEngine
  provider: SerpProviderId
  /** How many top competitors to analyse on-page (0 = skip). */
  analyzeTop: number
}

/** Response body for `POST /api/serp`. */
export interface SerpResponse {
  query: string
  engine: SerpEngine
  provider: Exclude<SerpProviderId, 'auto'>
  rank: number | null
  results: SerpResult[]
  competitors: SerpCompetitor[]
  /** Present when the engine blocked us or the provider is unusable. */
  error?: string
  /** Machine-readable error kind so the UI can react (e.g. auto-pause). */
  errorCode?: SerpErrorCode
}

/** Why a SERP lookup failed. */
export type SerpErrorCode =
  /** The engine served a consent wall or CAPTCHA. */
  | 'blocked'
  /** No results could be extracted (markup change or empty SERP). */
  | 'empty'
  /** A paid provider was requested but no key is configured. */
  | 'no_key'
  /** Network or navigation failure. */
  | 'network'
  /** Request validation failed. */
  | 'invalid'

/** Options the user can tune for a SERP run. */
export interface SerpOptions {
  /** Which engine's results to read. */
  engine: SerpEngine
  /** Backend: `auto` prefers a configured paid API over the browser. */
  provider: SerpProviderId
  /** Maximum derived queries per run. */
  maxQueries: number
  /** Top competitors to analyse on-page per query (0 = skip). */
  analyzeTop: number
  /** Minimum delay between two queries, in ms. */
  minIntervalMs: number
}

/** Run status of the client-side SERP queue. */
export type SerpStatus = 'idle' | 'running' | 'paused' | 'stopped' | 'done'

/** Minimum delay between two SERP queries, to stay under the engines' radar. */
export const SERP_MIN_INTERVAL_MS = 20_000

/** Default and maximum number of derived queries per run. */
export const SERP_DEFAULT_MAX_QUERIES = 20
export const SERP_MAX_QUERIES = 100

/** How many organic results to keep. */
export const SERP_RESULT_LIMIT = 20

/** Default number of competitors to analyse on-page. */
export const SERP_DEFAULT_ANALYZE_TOP = 2
export const SERP_MAX_ANALYZE_TOP = 5