/**
 * SERP extraction, run inside the search-results page.
 *
 * Like the SEO collector, both functions are **fully self-contained**: they are passed
 * to `page.evaluate`, which serializes them, so they may not reference module scope.
 * The optional `doc = document` parameter keeps them callable from jsdom in tests.
 *
 * 在搜尋結果頁面內執行的擷取。與 SEO 採集一樣，兩個函式**完全自足**：
 * 會被交給 `page.evaluate` 序列化，因此不能引用模組作用域。
 * 選填的 `doc = document` 參數讓測試能以 jsdom 呼叫。
 */
import type { SerpResult } from '@/types/serp'

/**
 * Read the organic results out of a search results document.
 *
 * Anchors are collected in DOM order (organic results come first) and filtered:
 * non-http(s), the engine's own hosts, ad containers and `/url?q=` redirect wrappers
 * are dropped, and duplicates keep their first position.
 *
 * This is inherently fragile — both engines change their markup — so it is written as
 * a permissive heuristic rather than against exact class names.
 *
 * 從搜尋結果文件中讀取自然結果。依 DOM 順序收集錨點（自然結果在前）並過濾：
 * 非 http(s)、引擎自家網域、廣告容器與 `/url?q=` 轉址包裝都會被丟棄，
 * 重複者保留第一次出現的位置。這本質上很脆弱（兩家引擎都會改版），
 * 因此採寬鬆啟發式而非綁定 class 名稱。
 *
 * @param doc Search results document (defaults to the browser's `document`).
 */
export function collectSerpResults(doc: Document = document): SerpResult[] {
  const MAX_RESULTS = 30

  /** Hosts that are never an organic result. */
  const ENGINE_HOSTS = [
    'google.com', 'www.google.com', 'googleusercontent.com', 'gstatic.com',
    'google.co', 'bing.com', 'www.bing.com', 'microsoft.com', 'msn.com',
    'youtube.com', 'www.youtube.com', 'support.google.com', 'accounts.google.com',
    'policies.google.com', 'maps.google.com',
  ]

  /** Whether a host is the engine itself (or an obvious subdomain). */
  const isEngineHost = (hostname: string): boolean => {
    const host = hostname.toLowerCase().replace(/^www\./, '')
    return ENGINE_HOSTS.some((engine) => host === engine.replace(/^www\./, '') || host.endsWith('.' + engine))
  }

  /** Whether an anchor sits inside an advertisement block. */
  const isAd = (anchor: Element): boolean => {
    let node: Element | null = anchor
    for (let depth = 0; node && depth < 6; depth += 1) {
      const label = (node.getAttribute('aria-label') ?? '').toLowerCase()
      const text = (node.textContent ?? '').slice(0, 40).toLowerCase()
      if (node.hasAttribute('data-text-ad')) return true
      if (label.includes('sponsored') || label.includes('advertisement')) return true
      if (text.startsWith('sponsored') || text.startsWith('ad ·')) return true
      const className = typeof node.className === 'string' ? node.className : ''
      if (/(^|\s)(b_ad|ads-fr|commercial-unit)(\s|$)/.test(className)) return true
      node = node.parentElement
    }
    return false
  }

  const seen: Record<string, true> = {}
  const results: SerpResult[] = []
  const anchors = doc.querySelectorAll('a[href]')

  for (let i = 0; i < anchors.length && results.length < MAX_RESULTS; i += 1) {
    const anchor = anchors[i]
    const href = anchor.getAttribute('href') ?? ''
    if (!href) continue
    if (isAd(anchor)) continue

    let parsed: URL
    try {
      parsed = new URL(href, doc.baseURI)
    } catch {
      continue
    }
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') continue

    // Google wraps some links as /url?q=<target>.
    if (parsed.pathname === '/url' && parsed.searchParams.get('q')) {
      try {
        parsed = new URL(parsed.searchParams.get('q') as string)
      } catch {
        continue
      }
    }

    if (isEngineHost(parsed.hostname)) continue

    // Normalize: drop the hash and tracking-heavy fragments only.
    parsed.hash = ''
    const url = parsed.toString()
    if (seen[url]) continue
    seen[url] = true

    const heading = anchor.querySelector('h2, h3, [role="heading"]')
    const title = (heading?.textContent ?? anchor.textContent ?? '').trim().replace(/\s+/g, ' ').slice(0, 200)

    results.push({ position: results.length + 1, url, title, hostname: parsed.hostname })
  }

  return results
}

/**
 * Whether the page is a consent wall, CAPTCHA or "unusual traffic" block.
 *
 * @param doc Search results document.
 * @returns A short machine-readable reason, or `null` when the page looks normal.
 */
export function detectSerpBlock(doc: Document = document): string | null {
  const markers = [
    'unusual traffic',
    'our systems have detected',
    'why did this happen',
    'captcha',
    'are you a robot',
    '/sorry/',
    'consent.google.com',
    'before you continue',
    'enable javascript and cookies',
    'verify you are human',
  ]

  const location = (doc.defaultView?.location?.href ?? doc.baseURI ?? '').toLowerCase()
  // jsdom has no `innerText`; fall back to `textContent` so tests behave like a browser.
  const text = ((doc.body?.innerText ?? doc.body?.textContent ?? '').slice(0, 2000)).toLowerCase()

  for (const marker of markers) {
    if (location.includes(marker) || text.includes(marker)) return marker
  }
  return null
}

/**
 * Build the search URL for an engine.
 *
 * @param engine  Target engine.
 * @param query   User query.
 * @param locale  Optional `hl`/`gl` hints (e.g. `en`, `us`).
 */
export function buildSerpUrl(engine: 'google' | 'bing', query: string, locale = 'en'): string {
  const encoded = encodeURIComponent(query)
  if (engine === 'bing') {
    return `https://www.bing.com/search?q=${encoded}&count=30&setlang=${locale}`
  }
  return `https://www.google.com/search?q=${encoded}&num=30&hl=${locale}`
}