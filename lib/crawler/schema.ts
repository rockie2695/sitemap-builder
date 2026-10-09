/**
 * Runtime schemas shared by the API route and the browser client.
 *
 * Why bother: the crawl API is called from the UI on every page. Validating the
 * response there means a server/client mismatch (renamed field, missing optional)
 * surfaces as an explicit error instead of silently writing `undefined` into the
 * UI, and the request side gets one source of truth for the error messages.
 *
 * API 與瀏覽器端共用的執行期結構驗證。抓取 API 每抓一頁就會呼叫一次，
 * 在客戶端驗證回應可讓欄位改名或選填欄位遺漏時明確報錯，
 * 而不是默默把 `undefined` 寫進介面；請求端也只需要一份錯誤訊息來源。
 */
import { z } from 'zod'

/** Body accepted by `POST /api/crawl`. */
export const crawlRequestSchema = z.object({
  /** Absolute URL of the page to open. */
  url: z.url({ error: 'url 必须是合法的绝对地址' }),
  /** Scope origin; links on other origins are dropped. */
  origin: z.url({ error: 'origin 必须是合法的绝对地址' }),
  /** Path scope, e.g. `/test`; empty string means "every path on this origin". */
  pathPrefix: z.string().default(''),
  /** true = drop the whole query string, false = keep it minus tracking params. */
  stripQuery: z.boolean().default(true),
})

/** Infer the validated request type. */
export type CrawlRequest = z.infer<typeof crawlRequestSchema>

/** A single keyword frequency entry. */
const seoKeywordSchema = z.object({
  term: z.string(),
  count: z.number(),
})

/** One captured heading. */
const seoHeadingSchema = z.object({
  level: z.number(),
  text: z.string(),
})

/**
 * On-page SEO snapshot.
 *
 * Optional on the response so a client can still talk to an older server build that
 * does not collect it yet.
 *
 * 單頁 SEO 快照。在回應中為選填，讓客戶端仍能與尚未收集它的舊版伺服器協作。
 */
export const seoSnapshotSchema = z.object({
  title: z.string().nullable(),
  titleLength: z.number(),
  metaDescription: z.string().nullable(),
  metaDescriptionLength: z.number(),
  h1: z.array(z.string()),
  headings: z.array(seoHeadingSchema),
  canonical: z.string().nullable(),
  metaRobots: z.string().nullable(),
  indexable: z.boolean(),
  lang: z.string().nullable(),
  hasViewport: z.boolean(),
  openGraph: z.object({
    title: z.boolean(),
    description: z.boolean(),
    image: z.boolean(),
  }),
  twitter: z.object({
    card: z.boolean(),
    title: z.boolean(),
    description: z.boolean(),
    image: z.boolean(),
  }),
  images: z.object({ total: z.number(), missingAlt: z.number() }),
  links: z.object({ internal: z.number(), external: z.number(), nofollow: z.number() }),
  wordCount: z.number(),
  structuredData: z.array(z.string()),
  hreflang: z.array(z.string()),
  keywords: z.array(seoKeywordSchema),
})

/** Body returned by `POST /api/crawl`, including partial failures. */
export const crawlResponseSchema = z.object({
  /** Normalized, in-scope links found on the page. */
  links: z.array(z.string()),
  /** Number of in-scope links skipped because they are not HTML documents. */
  skippedLinks: z.number(),
  /** The URL we were asked to open. */
  pageUrl: z.string(),
  /** Final URL after redirects. */
  finalUrl: z.string(),
  /** Document title, or null when unavailable. */
  pageTitle: z.string().nullable(),
  /** HTTP status of the main navigation response. */
  httpStatus: z.number().nullable(),
  /** Raw `Last-Modified` response header, when the server sends one. */
  lastModified: z.string().nullable(),
  /** On-page SEO snapshot (absent on older server builds). */
  seo: seoSnapshotSchema.optional(),
  /** Server-side handling time in milliseconds. */
  durationMs: z.number(),
  /** Present when the page reported an error; `links` may still be populated. */
  error: z.string().optional(),
})

/** Infer the validated response type. */
export type CrawlResponsePayload = z.infer<typeof crawlResponseSchema>

/**
 * Turn a zod failure into a single human-readable Chinese sentence.
 *
 * @param error Zod error from `safeParse`.
 * @returns Message suitable for direct display in the UI.
 */
export function formatZodError(error: z.ZodError): string {
  return error.issues
    .map((issue) => {
      const path = issue.path.join('.') || 'body'
      return `${path}：${issue.message}`
    })
    .join('；')
}