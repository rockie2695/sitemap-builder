/**
 * On-page SEO types.
 *
 * The audit is a set of transparent heuristics — it is **our** checklist, not a
 * Google metric. Nothing here claims to predict ranking.
 *
 * 站內 SEO 型別。這份稽核是一組透明的啟發式規則——是**我們自己的**檢查清單，
 * 不是 Google 的指標，也不宣稱能預測排名。
 */

/** One heading captured from the document. */
export interface SeoHeading {
  /** 1, 2 or 3. */
  level: number
  text: string
}

/** Image usage. */
export interface SeoImageStats {
  total: number
  /** Images without an `alt` attribute (an empty `alt=""` counts as intentional). */
  missingAlt: number
}

/** Link usage. */
export interface SeoLinkStats {
  /** Same-origin links. */
  internal: number
  /** Other-origin links. */
  external: number
  /** Links carrying `rel="nofollow"` (or `sponsored`/`ugc`). */
  nofollow: number
}

/** A keyword with its occurrence count. */
export interface SeoKeyword {
  term: string
  count: number
}

/**
 * Everything the audit reads from one page.
 *
 * Collected by `collectSeoFromDocument` during the crawl and stored on the record, so
 * scoring and reporting stay pure client-side functions.
 *
 * 稽核會讀取的單頁資料。抓取時由 `collectSeoFromDocument` 收集並存在記錄上，
 * 之後的評分與報告都是純函式。
 */
export interface SeoSnapshot {
  title: string | null
  titleLength: number
  metaDescription: string | null
  metaDescriptionLength: number
  /** All `<h1>` texts (capped). */
  h1: string[]
  /** The first few headings, for structure checks. */
  headings: SeoHeading[]
  /** Resolved canonical URL. */
  canonical: string | null
  /** Raw `meta[name=robots]` content, lower-cased. */
  metaRobots: string | null
  /** False when the robots meta asks for `noindex`. */
  indexable: boolean
  /** `<html lang>` value. */
  lang: string | null
  hasViewport: boolean
  openGraph: {
    title: boolean
    description: boolean
    image: boolean
  }
  twitter: {
    card: boolean
    title: boolean
    description: boolean
    image: boolean
  }
  images: SeoImageStats
  links: SeoLinkStats
  /** Approximate word count (Latin words plus CJK characters). */
  wordCount: number
  /** JSON-LD `@type` values found on the page (capped). */
  structuredData: string[]
  /** Declared `hreflang` values (capped). */
  hreflang: string[]
  /** Top terms by frequency (capped). */
  keywords: SeoKeyword[]
}

/** Outcome of a single check. */
export type SeoStatus = 'pass' | 'warn' | 'fail' | 'info'

/** Identifiers for every audit rule. */
export type SeoCheckId =
  | 'title.present'
  | 'title.length'
  | 'title.unique'
  | 'description.present'
  | 'description.length'
  | 'description.unique'
  | 'h1.present'
  | 'h1.single'
  | 'canonical.present'
  | 'canonical.self'
  | 'robots.indexable'
  | 'images.alt'
  | 'content.length'
  | 'og.present'
  | 'twitter.present'
  | 'structuredData.present'
  | 'lang.present'
  | 'viewport.present'
  | 'hreflang.present'

/** One evaluated rule. */
export interface SeoCheck {
  id: SeoCheckId
  status: SeoStatus
  /** Value shown next to the check (already stringified). */
  value?: string | number | null
}

/** Score plus every check, for one page. */
export interface SeoScore {
  /** 0–100, `null` when nothing was collected. */
  score: number | null
  checks: SeoCheck[]
}

/** Aggregated site-wide findings. */
export interface SeoReport {
  /** Titles used by more than one page: title → URLs. */
  duplicateTitles: Array<{ value: string; urls: string[] }>
  /** Meta descriptions used by more than one page. */
  duplicateDescriptions: Array<{ value: string; urls: string[] }>
  /** Pages with no `<title>`. */
  missingTitle: string[]
  /** Pages with no meta description. */
  missingDescription: string[]
  /** Pages with more than one `<h1>`. */
  multipleH1: string[]
  /** Pages whose robots meta blocks indexing. */
  notIndexable: string[]
  /** Pages with fewer than {@link THIN_CONTENT_WORDS} words. */
  thinContent: string[]
  /** Pages whose canonical points at a different URL. */
  canonicalMismatch: string[]
}

/** Word count below which a page is reported as thin. */
export const THIN_CONTENT_WORDS = 200

/** Preferred title length window. */
export const TITLE_LENGTH = { min: 15, max: 60 } as const

/** Preferred meta description length window. */
export const DESCRIPTION_LENGTH = { min: 50, max: 160 } as const