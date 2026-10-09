/**
 * Per-page SEO collection.
 *
 * `collectSeoFromDocument` is **fully self-contained on purpose**: it is passed to
 * `page.evaluate()`, which serializes the function and runs it inside the browser, so
 * it cannot reference anything from this module's scope. The default parameter lets it
 * be called with no arguments in the page while tests pass a jsdom `Document`.
 *
 * `collectSeoFromDocument` 刻意**完全自足**：它被傳給 `page.evaluate()`，
 * 會被序列化後在瀏覽器內執行，因此不能引用本模組作用域的任何東西。
 * 預設參數讓它在頁面內可無參呼叫，測試則傳入 jsdom 的 `Document`。
 */
import type { SeoHeading, SeoKeyword, SeoSnapshot } from '@/types/seo'

/**
 * Read the SEO signals of one document.
 *
 * @param doc Document to inspect (defaults to the browser's `document` so the function
 *            can be handed straight to `page.evaluate`).
 */
export function collectSeoFromDocument(doc: Document = document): SeoSnapshot {
  // ---- helpers and caps (must live inside: the function is serialized to the page) ----
  const MAX_HEADINGS = 50
  const MAX_H1 = 10
  const MAX_STRUCTURED_TYPES = 10
  const MAX_HREFLANG = 10
  const MAX_KEYWORDS = 10
  const MAX_HEADING_CHARS = 120
  const MAX_TITLE_CHARS = 300
  const MAX_DESCRIPTION_CHARS = 500

  const meta = (selector: string): string | null => {
    const element = doc.querySelector(selector)
    const value = element?.getAttribute('content')?.trim()
    return value ? value : null
  }

  const STOPWORDS: Record<string, true> = {
    the: true, and: true, for: true, with: true, that: true, this: true, from: true,
    are: true, was: true, were: true, has: true, have: true, had: true, not: true,
    you: true, your: true, our: true, their: true, its: true, all: true, any: true,
    can: true, will: true, more: true, one: true, two: true, use: true, using: true,
    about: true, into: true, over: true, also: true, than: true, then: true,
    when: true, what: true, which: true, who: true, how: true, why: true, but: true,
    out: true, up: true, down: true, only: true, other: true, some: true, such: true,
    yes: true, may: true, each: true, most: true, many: true, much: true, very: true,
    just: true, like: true, get: true, got: true, see: true, new: true, now: true,
    way: true, well: true, make: true, made: true, take: true, first: true,
    last: true, next: true, back: true, still: true, even: true, ever: true,
    every: true, both: true, few: true, own: true, same: true, too: true, does: true,
    did: true, doing: true, done: true, being: true, been: true, am: true, is: true,
    be: true, to: true, of: true, in: true, on: true, at: true, by: true, or: true,
    as: true, it: true, if: true, we: true, he: true, she: true, they: true,
    them: true, his: true, her: true, my: true, me: true, an: true, a: true,
  }

  const groupWords = (text: string): { latin: number; cjk: number } => {
    const trimmed = text.trim()
    if (!trimmed) return { latin: 0, cjk: 0 }
    const latin = trimmed.match(/[A-Za-z0-9]+/g)?.length ?? 0
    const cjkMatches = trimmed.match(/[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff\uac00-\ud7af]/g)
    return { latin, cjk: cjkMatches?.length ?? 0 }
  }

  // ---- title & description ----
  const rawTitle = (doc.title || '').trim()
  const title = rawTitle ? rawTitle.slice(0, MAX_TITLE_CHARS) : null
  const rawDescription = meta('meta[name="description"]')
  const metaDescription = rawDescription ? rawDescription.slice(0, MAX_DESCRIPTION_CHARS) : null

  // ---- headings ----
  const headings: SeoHeading[] = []
  const headingNodes = doc.querySelectorAll('h1, h2, h3')
  for (let i = 0; i < headingNodes.length && headings.length < MAX_HEADINGS; i += 1) {
    const node = headingNodes[i]
    headings.push({
      level: Number(node.tagName.charAt(1)),
      text: (node.textContent ?? '').trim().replace(/\s+/g, ' ').slice(0, MAX_HEADING_CHARS),
    })
  }
  const h1 = headings
    .filter((heading) => heading.level === 1)
    .map((heading) => heading.text)
    .slice(0, MAX_H1)

  // ---- canonical & robots ----
  const canonicalRaw = doc.querySelector('link[rel="canonical"]')?.getAttribute('href')?.trim()
  let canonical: string | null = null
  if (canonicalRaw) {
    try {
      canonical = new URL(canonicalRaw, doc.baseURI).toString()
    } catch {
      canonical = canonicalRaw
    }
  }

  const metaRobots = meta('meta[name="robots"]')
  const indexable = !(metaRobots ? /noindex/i.test(metaRobots) : false)

  // ---- framework hints ----
  const lang = doc.documentElement.getAttribute('lang')?.trim() || null
  const hasViewport = Boolean(meta('meta[name="viewport"]'))

  const openGraph = {
    title: Boolean(meta('meta[property="og:title"]')),
    description: Boolean(meta('meta[property="og:description"]')),
    image: Boolean(meta('meta[property="og:image"]')),
  }

  const twitter = {
    card: Boolean(meta('meta[name="twitter:card"]')),
    title: Boolean(meta('meta[name="twitter:title"]')),
    description: Boolean(meta('meta[name="twitter:description"]')),
    image: Boolean(meta('meta[name="twitter:image"]')),
  }

  // ---- images & links ----
  const imageNodes = doc.querySelectorAll('img')
  let missingAlt = 0
  for (let i = 0; i < imageNodes.length; i += 1) {
    if (!imageNodes[i].hasAttribute('alt')) missingAlt += 1
  }

  let internal = 0
  let external = 0
  let nofollow = 0
  const linkNodes = doc.querySelectorAll('a[href]')
  for (let i = 0; i < linkNodes.length; i += 1) {
    const anchor = linkNodes[i]
    const href = anchor.getAttribute('href') ?? ''
    if (!href || href.startsWith('#')) continue

    let parsed: URL
    try {
      parsed = new URL(href, doc.baseURI)
    } catch {
      continue
    }
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') continue

    if (parsed.origin === new URL(doc.baseURI).origin) internal += 1
    else external += 1

    const rel = (anchor.getAttribute('rel') ?? '').toLowerCase()
    if (rel.includes('nofollow') || rel.includes('sponsored') || rel.includes('ugc')) nofollow += 1
  }

  // ---- text, keywords, word count ----
  const bodyText = (doc.body?.innerText ?? doc.body?.textContent ?? '').replace(/\s+/g, ' ')
  const counts = groupWords(bodyText)
  const wordCount = counts.latin + counts.cjk

  const frequencies: Record<string, number> = {}
  const bump = (term: string): void => {
    frequencies[term] = (frequencies[term] ?? 0) + 1
  }

  // Latin tokens.
  const latinTokens = bodyText.toLowerCase().match(/[a-z0-9]+/g) ?? []
  for (const token of latinTokens) {
    if (token.length < 3 || STOPWORDS[token] === true) continue
    bump(token)
  }

  // CJK bigrams (Chinese/Japanese/Korean has no word separators).
  const cjkRuns = bodyText.match(/[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff\uac00-\ud7af]+/g) ?? []
  for (const run of cjkRuns) {
    for (let i = 0; i + 1 < run.length; i += 1) bump(run.slice(i, i + 2))
  }

  const keywords: SeoKeyword[] = Object.keys(frequencies)
    .map((term) => ({ term, count: frequencies[term] }))
    .filter((entry) => entry.count > 1)
    .sort((a, b) => b.count - a.count || (a.term < b.term ? -1 : 1))
    .slice(0, MAX_KEYWORDS)

  // ---- structured data ----
  const structured: Record<string, true> = {}
  const scripts = doc.querySelectorAll('script[type="application/ld+json"]')
  const collectTypes = (value: unknown): void => {
    if (!value || typeof value !== 'object') return
    if (Array.isArray(value)) {
      for (const item of value) collectTypes(item)
      return
    }
    const record = value as Record<string, unknown>
    const type = record['@type']
    if (typeof type === 'string') structured[type] = true
    else if (Array.isArray(type)) for (const item of type) if (typeof item === 'string') structured[item] = true
    if (record['@graph']) collectTypes(record['@graph'])
  }
  for (let i = 0; i < scripts.length; i += 1) {
    try {
      collectTypes(JSON.parse(scripts[i].textContent ?? ''))
    } catch {
      // Invalid JSON-LD is ignored; the report still flags its absence.
    }
  }
  const structuredData = Object.keys(structured).slice(0, MAX_STRUCTURED_TYPES)

  // ---- hreflang ----
  const hreflangSeen: Record<string, true> = {}
  const alternates = doc.querySelectorAll('link[rel="alternate"][hreflang]')
  for (let i = 0; i < alternates.length; i += 1) {
    const value = alternates[i].getAttribute('hreflang')?.trim()
    if (value) hreflangSeen[value] = true
  }
  const hreflang = Object.keys(hreflangSeen).slice(0, MAX_HREFLANG)

  return {
    title,
    titleLength: title?.length ?? 0,
    metaDescription,
    metaDescriptionLength: metaDescription?.length ?? 0,
    h1,
    headings,
    canonical,
    metaRobots,
    indexable,
    lang,
    hasViewport,
    openGraph,
    twitter,
    images: { total: imageNodes.length, missingAlt },
    links: { internal, external, nofollow },
    wordCount,
    structuredData,
    hreflang,
    keywords,
  }
}

/** Exposed for tests: the CJK/word-count heuristic used above. */
export function countWordsInText(text: string): number {
  const trimmed = text.trim()
  if (!trimmed) return 0
  const latin = trimmed.match(/[A-Za-z0-9]+/g)?.length ?? 0
  const cjk = trimmed.match(/[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff\uac00-\ud7af]/g)?.length ?? 0
  return latin + cjk
}

/** Exposed for tests: whether a character belongs to a CJK range. */
export function isCjkChar(char: string): boolean {
  return CJK_CHAR.test(char)
}

/** Shared CJK range (kept in sync with the collector's inline copy). */
const CJK_CHAR = /[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff\uac00-\ud7af]/