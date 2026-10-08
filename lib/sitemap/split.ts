/**
 * Splitting a large archive into several sitemap files plus an index.
 *
 * sitemaps.org caps a single sitemap at 50,000 URLs / 50 MB, and search engines
 * accept at most 50,000 sitemap references in an index. Splitting keeps the
 * export usable for very large sites.
 *
 * 將大型結果拆分為多個 sitemap 檔案與索引檔。
 * sitemaps.org 限制單一 sitemap 為 50,000 筆／50MB，搜尋引擎最多接受
 * 50,000 筆索引項目；拆分可讓大型站點的匯出仍然可用。
 */
import type { DownloadPayload } from '@/lib/export/types'
import { SITEMAP_MAX_URLS } from './constants'
import { buildSitemapIndex, buildSitemapXml } from './build'
import type { SitemapEntry } from './entries'

/** Default number of URLs per generated sitemap file. */
export const DEFAULT_MAX_URLS_PER_FILE = 1_000

/** One generated file plus the metadata the index needs. */
export interface SitemapFile {
  /** File name, e.g. `sitemap-1.xml`. */
  name: string
  /** XML content. */
  content: string
  /** Newest `lastmod` inside the file, reused for the index entry. */
  lastmod: string | null
  /** Number of URLs in this file. */
  count: number
}

/** Result of {@link splitSitemaps}. */
export interface SplitResult {
  /** Every sitemap file produced. */
  files: SitemapFile[]
  /** The sitemapindex document, or `null` when no split was needed. */
  index: string | null
  /** True when the input exceeded `maxUrlsPerFile`. */
  split: boolean
  /** True when the input exceeded the hard 50,000-URL protocol limit. */
  overProtocolLimit: boolean
}

/**
 * Split entries into `sitemap-N.xml` chunks of at most `maxUrlsPerFile` URLs.
 *
 * When everything fits into one file the result mirrors the old behaviour: a single
 * `sitemap.xml` with **no** index (search engines do not need an index for one file).
 *
 * @param entries         Entries to write.
 * @param maxUrlsPerFile  URLs per file; clamped to `[1, 50_000]`.
 * @param baseUrl         Public origin used to build index `<loc>` values.
 */
export function splitSitemaps(
  entries: readonly SitemapEntry[],
  maxUrlsPerFile: number = DEFAULT_MAX_URLS_PER_FILE,
  baseUrl = '',
): SplitResult {
  const limit = Math.min(Math.max(1, Math.floor(maxUrlsPerFile) || 1), SITEMAP_MAX_URLS)

  // De-duplicate first: duplicate URLs would waste quota in every file.
  const unique: SitemapEntry[] = []
  const seen = new Set<string>()
  for (const entry of entries) {
    if (seen.has(entry.url)) continue
    seen.add(entry.url)
    unique.push(entry)
  }

  if (unique.length <= limit) {
    return {
      files: [
        {
          name: 'sitemap.xml',
          content: buildSitemapXml(unique),
          lastmod: newestLastmod(unique),
          count: unique.length,
        },
      ],
      index: null,
      split: false,
      overProtocolLimit: false,
    }
  }

  const files: SitemapFile[] = []
  for (let offset = 0; offset < unique.length; offset += limit) {
    const chunk = unique.slice(offset, offset + limit)
    const number = files.length + 1
    files.push({
      name: `sitemap-${number}.xml`,
      content: buildSitemapXml(chunk),
      lastmod: newestLastmod(chunk),
      count: chunk.length,
    })
  }

  return {
    files,
    index: buildSitemapIndex(
      files.map((file) => ({ name: file.name, lastmod: file.lastmod })),
      baseUrl,
    ),
    split: true,
    overProtocolLimit: unique.length > SITEMAP_MAX_URLS * 50,
  }
}

/** Newest `lastmod` in a set of entries, or null when none carry one. */
function newestLastmod(entries: readonly SitemapEntry[]): string | null {
  let newest: string | null = null
  for (const entry of entries) {
    if (!entry.lastmod) continue
    if (newest === null || entry.lastmod > newest) newest = entry.lastmod
  }
  return newest
}

/** Convert split results into downloadable payloads (index included when present). */
export function toDownloadPayloads(result: SplitResult): DownloadPayload[] {
  const payloads: DownloadPayload[] = result.files.map((file) => ({
    name: file.name,
    content: file.content,
    mime: 'application/xml',
  }))
  if (result.index) {
    payloads.push({ name: 'sitemapindex.xml', content: result.index, mime: 'application/xml' })
  }
  return payloads
}