/**
 * Link extraction and scoping.
 *
 * The rules implemented here decide what ends up in the sitemap, so they live in
 * one pure-ish module instead of being spread across the route handler.
 *
 * 連結擷取與範圍篩選。這裡的規則決定了最終會進到 sitemap 的內容，
 * 因此集中在一個模組，而不是散落在路由處理器中。
 */
import type { Page } from 'playwright'

import { looksLikeHtmlPage, normalizeUrl, shouldInclude } from '@/lib/url-utils'

/** Result of scanning one page for links. */
export interface ExtractedLinks {
  /** In-scope, normalized, de-duplicated HTML page URLs. */
  links: string[]
  /** How many in-scope links were dropped because they are not HTML documents. */
  skipped: number
}

/**
 * Collect every in-scope link from the loaded document.
 *
 * @param page       Playwright page (may be partially loaded — that is fine).
 * @param baseUrl    URL used to resolve relative hrefs.
 * @param origin     Scope origin.
 * @param pathPrefix Scope path, e.g. `/test`.
 * @param stripQuery Query-string policy.
 */
export async function extractLinks(
  page: Page,
  baseUrl: string,
  origin: string,
  pathPrefix: string,
  stripQuery: boolean,
): Promise<ExtractedLinks> {
  // One round-trip for the whole document instead of per-element evaluation.
  const hrefs = await page.$$eval('a[href]', (elements) =>
    elements.map((element) => element.getAttribute('href') ?? ''),
  )

  const links = new Set<string>()
  let skipped = 0

  for (const href of hrefs) {
    if (!href) continue

    // Drops mailto:/tel:/javascript:/bare hashes and normalizes the rest.
    const normalized = normalizeUrl(href, baseUrl, { stripQuery })
    if (!normalized) continue
    if (!shouldInclude(normalized, origin, pathPrefix)) continue
    // Non-HTML assets (pdf, images, archives…) must not end up in a sitemap.
    if (!looksLikeHtmlPage(normalized)) {
      skipped += 1
      continue
    }

    links.add(normalized)
  }

  return { links: [...links], skipped }
}