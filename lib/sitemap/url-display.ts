/**
 * URL presentation for exports.
 *
 * The crawl stores percent-encoded URLs (RFC 3986). Depending on the switches, an
 * export may need to:
 *
 * - use the post-redirect address instead of the requested one;
 * - rewrite the host (e.g. `localhost:4321` → the production domain);
 * - decode non-ASCII path/query characters so Chinese URLs read as text.
 *
 * All three exporters (sitemap.xml, CSV, JSON) funnel through {@link displayUrl} so
 * they can never disagree.
 *
 * 匯出時的 URL 呈現。抓取階段儲存的是百分號編碼（RFC 3986）的網址，
 * 匯出時可能需：
 * - 使用重定向後的最終位址；
 * - 替換主機名（例如 localhost:4321 → 正式網域）；
 * - 解碼非 ASCII 的路徑／查詢，讓中文網址以文字呈現。
 * 三種匯出（sitemap.xml、CSV、JSON）都經過 {@link displayUrl}，保證結果一致。
 */
import type { UrlRecord } from '@/types/crawl'

/** Presentation switches (a subset of `CrawlOptions`). */
export interface UrlDisplayOptions {
  /** Decode non-ASCII path/query characters. */
  readableUrls: boolean
  /** Prefer `finalUrl` (post-redirect) over the requested URL. */
  useFinalUrl: boolean
  /** Replacement origin such as `https://www.example.com`; empty = disabled. */
  hostOverride: string
}

/**
 * Normalize a host override into an origin, or `null` when unusable.
 *
 * @param value Raw user input, e.g. `https://www.example.com/`.
 */
export function parseHostOverride(value: string): string | null {
  const trimmed = value.trim()
  if (!trimmed) return null

  try {
    const parsed = new URL(trimmed)
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null
    return parsed.origin
  } catch {
    return null
  }
}

/**
 * Decode percent-encoded path and query characters, keeping the host encoded.
 *
 * The host stays punycode on purpose: browsers expose no IDN decoder, and the
 * punycode form is what search engines expect.
 *
 * @param url Absolute URL.
 * @returns The readable form, or the input when decoding fails.
 */
export function toReadableUrl(url: string): string {
  try {
    const parsed = new URL(url)
    // decodeURI leaves reserved characters (`&`, `=`, `#`…) encoded, which is what
    // we want for a valid URL.
    return `${parsed.origin}${decodeURI(parsed.pathname)}${decodeURI(parsed.search)}`
  } catch {
    return url
  }
}

/** Options needed by {@link displayUrl}. */
export type DisplayUrlContext = UrlDisplayOptions

/**
 * Produce the URL string an export should write for a record.
 *
 * Order matters: pick the source URL, then rewrite the host, then decode.
 *
 * @param record  Archive entry (only `url` and `finalUrl` are read).
 * @param context Presentation switches.
 *
 * @example
 * displayUrl(record, { readableUrls: true, useFinalUrl: false, hostOverride: 'https://example.com' })
 */
export function displayUrl(
  record: Pick<UrlRecord, 'url' | 'finalUrl'>,
  context: DisplayUrlContext,
): string {
  let value =
    context.useFinalUrl && record.finalUrl ? record.finalUrl : record.url

  const origin = parseHostOverride(context.hostOverride)
  if (origin) {
    try {
      const parsed = new URL(value)
      value = `${origin}${parsed.pathname}${parsed.search}`
    } catch {
      // Unparseable: keep the original rather than dropping the URL.
    }
  }

  return context.readableUrls ? toReadableUrl(value) : value
}