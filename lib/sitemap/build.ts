/**
 * XML serialisation for sitemaps.
 *
 * sitemap 的 XML 序列化。
 */
import type { SitemapEntry } from './entries'

/** Field order mandated by sitemaps.org: loc → lastmod → changefreq → priority. */

/**
 * Escape the five XML metacharacters.
 *
 * @param value Raw text (usually a URL).
 */
export function escapeXml(value: string): string {
  return value.replace(/[<>&'"]/g, (character) => {
    switch (character) {
      case '<':
        return '&lt;'
      case '>':
        return '&gt;'
      case '&':
        return '&amp;'
      case "'":
        return '&apos;'
      case '"':
        return '&quot;'
      default:
        return character
    }
  })
}

/**
 * Format a priority: sitemaps.org requires a single decimal between 0.0 and 1.0.
 *
 * @param value Raw priority (clamped into range).
 */
export function formatPriority(value: number): string {
  const clamped = Math.min(1, Math.max(0, value))
  return clamped.toFixed(1)
}

/**
 * Serialise entries as a `sitemap.xml` document.
 *
 * Duplicate URLs are dropped (first occurrence wins).
 *
 * @param entries Entries to serialise.
 */
export function buildSitemapXml(entries: readonly SitemapEntry[]): string {
  const seen = new Set<string>()
  const blocks: string[] = []

  for (const entry of entries) {
    if (seen.has(entry.url)) continue
    seen.add(entry.url)

    const lines = [`    <loc>${escapeXml(entry.url)}</loc>`]
    if (entry.lastmod) lines.push(`    <lastmod>${escapeXml(entry.lastmod)}</lastmod>`)
    if (entry.changefreq) lines.push(`    <changefreq>${entry.changefreq}</changefreq>`)
    if (typeof entry.priority === 'number') {
      lines.push(`    <priority>${formatPriority(entry.priority)}</priority>`)
    }

    blocks.push(`  <url>\n${lines.join('\n')}\n  </url>`)
  }

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...blocks,
    '</urlset>',
    '',
  ].join('\n')
}

/**
 * Serialise a `sitemapindex.xml` document pointing at split sitemap files.
 *
 * @param files Sitemap file names (e.g. `sitemap-1.xml`).
 * @param baseUrl Public origin the sitemap will be served from, without a trailing slash.
 * @param lastmodPerFile Optional `lastmod` per file (defaults to the newest entry's value).
 */
export function buildSitemapIndex(
  files: readonly { name: string; lastmod?: string | null }[],
  baseUrl: string,
): string {
  const origin = baseUrl.replace(/\/+$/, '')
  const blocks = files.map((file) => {
    const lines = [`    <loc>${escapeXml(`${origin}/${file.name}`)}</loc>`]
    if (file.lastmod) lines.push(`    <lastmod>${escapeXml(file.lastmod)}</lastmod>`)
    return `  <sitemap>\n${lines.join('\n')}\n  </sitemap>`
  })

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...blocks,
    '</sitemapindex>',
    '',
  ].join('\n')
}