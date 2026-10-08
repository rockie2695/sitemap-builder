/**
 * URL parsing, normalization and scoping rules.
 *
 * These functions decide what ends up in the sitemap, so every rule is documented
 * at its definition.
 *
 * 網址解析、規範化與範圍篩選規則。
 * 這些函式決定了最終進入 sitemap 的內容，因此每條規則都在定義處標註。
 */

/** Tracking params to strip: the utm_ prefix plus well-known click ids. */
const TRACKING_PARAMS = new Set([
  'gclid',
  'fbclid',
  'msclkid',
  'yclid',
  'igshid',
  'mc_cid',
  'mc_eid',
  'ref_src',
  'ref',
  'spm',
  'scm',
  '_ga',
  '_gl',
])

/** Extensions that are clearly not web pages; a hit means "not in the sitemap". */
const NON_HTML_EXTENSIONS = new Set([
  // Documents / 文件
  'pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'odt', 'ods', 'rtf', 'epub', 'mobi',
  // Archives / 壓縮檔
  'zip', 'rar', '7z', 'gz', 'tar', 'bz2', 'xz',
  // Images / 圖片
  'jpg', 'jpeg', 'png', 'gif', 'svg', 'webp', 'avif', 'ico', 'bmp', 'tif', 'tiff',
  // Audio & video / 音訊與視訊
  'mp3', 'mp4', 'm4a', 'm4v', 'avi', 'mov', 'wmv', 'flv', 'webm', 'ogg', 'wav', 'flac',
  // Front-end assets & data / 前端資源與資料
  'css', 'js', 'mjs', 'cjs', 'map', 'json', 'xml', 'rss', 'atom', 'csv', 'txt',
  // Fonts / 字型
  'woff', 'woff2', 'ttf', 'otf', 'eot',
  // Executables / 執行檔
  'exe', 'msi', 'dmg', 'pkg', 'apk', 'iso', 'deb', 'rpm',
])

/** Extensions that ARE pages (so a dot in the last segment is not a disqualifier). */
const HTML_EXTENSIONS = new Set(['html', 'htm', 'xhtml', 'php', 'asp', 'aspx', 'jsp', 'shtml'])

/** Options for {@link normalizeUrl}. */
export interface NormalizeOptions {
  /** true = drop the whole query string. */
  stripQuery?: boolean
  /** false = keep the trailing slash (used for the start URL, see below). */
  trimTrailingSlash?: boolean
}

/** Result of {@link parseStartUrl}. */
export interface ParsedStartUrl {
  /** e.g. `https://www.example.com`. */
  origin: string
  /** Empty string means "every path on this origin". */
  pathPrefix: string
  /** The URL the crawler will actually open. */
  startUrl: string
}

/**
 * Whether a query key is a tracking parameter.
 *
 * @param key Query parameter name (any case).
 */
export function isTrackingParam(key: string): boolean {
  const lower = key.toLowerCase()
  return lower.startsWith('utm_') || TRACKING_PARAMS.has(lower)
}

/**
 * Strip trailing slashes from a pathname, keeping the root's single `/`.
 *
 * @param pathname e.g. `/test/` → `/test`, `/` → `/`.
 */
function trimTrailingSlash(pathname: string): string {
  if (pathname.length <= 1) return pathname
  const trimmed = pathname.replace(/\/+$/, '')
  return trimmed === '' ? '/' : trimmed
}

/**
 * Parse a user-supplied start URL into the crawl scope.
 *
 * The start URL is used AS TYPED (hash stripped only): many sites respond on only
 * one of `/test` and `/test/`, so normalizing it away would 404 the very first page.
 *
 * @param input Raw user input.
 * @returns The scope, or `null` for empty / non-http(s) / unparseable input.
 */
export function parseStartUrl(input: string): ParsedStartUrl | null {
  const trimmed = input.trim()
  if (!trimmed) return null

  let parsed: URL
  try {
    parsed = new URL(trimmed)
  } catch {
    return null
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null

  // The start URL keeps its own query string and trailing slash; only the hash goes.
  const startUrl = normalizeUrl(trimmed, trimmed, { stripQuery: false, trimTrailingSlash: false })
  if (!startUrl) return null

  const pathPrefix = parsed.pathname === '/' ? '' : trimTrailingSlash(parsed.pathname)

  return { origin: parsed.origin, pathPrefix, startUrl }
}

/**
 * Normalize an href into an absolute URL.
 *
 * Pipeline: absolutize → strip the hash → apply the query policy → trim the
 * trailing slash. Returns `null` for anything that is not an http(s) URL.
 *
 * @param raw     Raw href from the DOM.
 * @param base    URL used to resolve relative hrefs.
 * @param options Query / slash policy.
 *
 * @example
 * normalizeUrl('a.html#x', 'https://example.com/test/') // 'https://example.com/test/a.html'
 * normalizeUrl('mailto:a@b.com', 'https://example.com/') // null
 */
export function normalizeUrl(
  raw: string,
  base: string,
  options: NormalizeOptions = {},
): string | null {
  const href = raw.trim()
  if (!href || href.startsWith('#')) return null

  let parsed: URL
  try {
    parsed = new URL(href, base)
  } catch {
    return null
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null

  parsed.hash = ''

  if (options.stripQuery) {
    parsed.search = ''
  } else if (parsed.search) {
    for (const key of [...parsed.searchParams.keys()]) {
      if (isTrackingParam(key)) parsed.searchParams.delete(key)
    }
    if ([...parsed.searchParams.keys()].length === 0) parsed.search = ''
  }

  if (options.trimTrailingSlash === false) {
    // Keep the user's form (start URL only).
  } else {
    parsed.pathname = trimTrailingSlash(parsed.pathname)
  }

  return parsed.toString()
}

/**
 * Whether a URL belongs to the crawl scope.
 *
 * 1. same origin;
 * 2. empty prefix → every same-origin path passes;
 * 3. otherwise the pathname must equal the prefix or start with `prefix + '/'` —
 *    so `/test` does NOT match `/testing` or `/testimonials`.
 *
 * @param url        Absolute URL to test.
 * @param origin     Scope origin.
 * @param pathPrefix Scope path (empty = unrestricted).
 */
export function shouldInclude(url: string, origin: string, pathPrefix: string): boolean {
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return false
  }
  if (parsed.origin !== origin) return false
  if (!pathPrefix) return true

  const pathname = trimTrailingSlash(parsed.pathname)
  return pathname === pathPrefix || pathname.startsWith(`${pathPrefix}/`)
}

/**
 * Whether a URL looks like an HTML page.
 *
 * Used to keep PDFs, images, archives and data files out of the sitemap. Only the
 * last path segment is inspected; pages with dots in earlier segments are fine.
 *
 * @param url Absolute URL.
 *
 * @example
 * looksLikeHtmlPage('https://example.com/a.html') // true
 * looksLikeHtmlPage('https://example.com/doc.pdf') // false
 */
export function looksLikeHtmlPage(url: string): boolean {
  let pathname: string
  try {
    pathname = new URL(url).pathname
  } catch {
    return false
  }

  const lastSegment = pathname.split('/').pop()
  if (!lastSegment) return true

  const dotIndex = lastSegment.lastIndexOf('.')
  if (dotIndex <= 0) return true

  const extension = lastSegment.slice(dotIndex + 1).toLowerCase()
  if (!extension) return true
  if (HTML_EXTENSIONS.has(extension)) return true

  return !NON_HTML_EXTENSIONS.has(extension)
}

/**
 * Short path for display: the URL minus its origin and hash.
 *
 * @param url Absolute URL.
 */
export function shortPath(url: string): string {
  try {
    const parsed = new URL(url)
    return `${parsed.pathname}${parsed.search}`
  } catch {
    return url
  }
}