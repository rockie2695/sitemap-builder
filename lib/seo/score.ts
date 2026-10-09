/**
 * SEO scoring: turn a {@link SeoSnapshot} into a transparent 0–100 score.
 *
 * Every rule has a fixed weight (they sum to 100), `warn` earns half, and `info`
 * checks are excluded from the denominator. This is **our** heuristic — the UI says so.
 *
 * SEO 評分：把 {@link SeoSnapshot} 轉成透明的 0～100 分。
 * 每條規則有固定權重（合計 100），`warn` 得一半，`info` 不計入分母。
 * 這是**我們自己的**啟發式規則，介面上會明確標示。
 */
import { isSameUrl } from '@/lib/url-utils'
import type { UrlRecord } from '@/types/crawl'
import type { SeoCheck, SeoCheckId, SeoReport, SeoScore, SeoSnapshot } from '@/types/seo'
import { DESCRIPTION_LENGTH, THIN_CONTENT_WORDS, TITLE_LENGTH } from '@/types/seo'

/** Weight per rule; sums to 100. */
export const CHECK_WEIGHTS: Record<SeoCheckId, number> = {
  'title.present': 8,
  'title.length': 8,
  'title.unique': 4,
  'description.present': 6,
  'description.length': 6,
  'description.unique': 3,
  'h1.present': 5,
  'h1.single': 5,
  'canonical.present': 5,
  'canonical.self': 5,
  'robots.indexable': 10,
  'images.alt': 10,
  'content.length': 5,
  'og.present': 5,
  'twitter.present': 5,
  'structuredData.present': 5,
  'lang.present': 3,
  'viewport.present': 2,
  // Informational only.
  'hreflang.present': 0,
}

/** Values a rule needs from the rest of the site. */
export interface ScoreContext {
  /** Titles used by more than one crawled page. */
  duplicateTitles: ReadonlySet<string>
  /** Descriptions used by more than one crawled page. */
  duplicateDescriptions: ReadonlySet<string>
}

/** An empty context (nothing duplicated). */
export const EMPTY_SCORE_CONTEXT: ScoreContext = {
  duplicateTitles: new Set(),
  duplicateDescriptions: new Set(),
}

/** Build the duplicate sets from a site-wide report. */
export function contextFromReport(report: SeoReport): ScoreContext {
  return {
    duplicateTitles: new Set(report.duplicateTitles.map((group) => group.value)),
    duplicateDescriptions: new Set(report.duplicateDescriptions.map((group) => group.value)),
  }
}

/** Whether a length sits inside an inclusive window. */
function inWindow(length: number, window: { min: number; max: number }): boolean {
  return length >= window.min && length <= window.max
}

/**
 * Evaluate every rule for one page.
 *
 * @param seo  The collected snapshot.
 * @param url  The page's URL (for the canonical self-check).
 * @param context Site-wide duplicate sets.
 */
export function evaluateChecks(seo: SeoSnapshot, url: string, context: ScoreContext): SeoCheck[] {
  const title = seo.title
  const description = seo.metaDescription
  const altRatio = seo.images.total === 0 ? 0 : seo.images.missingAlt / seo.images.total

  const ogCount = [seo.openGraph.title, seo.openGraph.description, seo.openGraph.image].filter(Boolean).length
  const twitterCount = [
    seo.twitter.card,
    seo.twitter.title,
    seo.twitter.description,
    seo.twitter.image,
  ].filter(Boolean).length

  return [
    { id: 'title.present', status: title ? 'pass' : 'fail', value: title ? title.length : null },
    {
      id: 'title.length',
      status: !title ? 'fail' : inWindow(title.length, TITLE_LENGTH) ? 'pass' : 'warn',
      value: title ? title.length : null,
    },
    {
      id: 'title.unique',
      status: !title ? 'info' : context.duplicateTitles.has(title) ? 'warn' : 'pass',
    },
    { id: 'description.present', status: description ? 'pass' : 'fail' },
    {
      id: 'description.length',
      status: !description
        ? 'fail'
        : inWindow(description.length, DESCRIPTION_LENGTH)
          ? 'pass'
          : 'warn',
      value: description ? description.length : null,
    },
    {
      id: 'description.unique',
      status: !description
        ? 'info'
        : context.duplicateDescriptions.has(description)
          ? 'warn'
          : 'pass',
    },
    { id: 'h1.present', status: seo.h1.length > 0 ? 'pass' : 'fail', value: seo.h1.length },
    {
      id: 'h1.single',
      status: seo.h1.length === 0 ? 'info' : seo.h1.length === 1 ? 'pass' : 'fail',
      value: seo.h1.length,
    },
    { id: 'canonical.present', status: seo.canonical ? 'pass' : 'warn' },
    {
      id: 'canonical.self',
      status: !seo.canonical ? 'info' : isSameUrl(seo.canonical, url) ? 'pass' : 'warn',
      value: seo.canonical,
    },
    { id: 'robots.indexable', status: seo.indexable ? 'pass' : 'fail', value: seo.metaRobots },
    {
      id: 'images.alt',
      status:
        seo.images.total === 0
          ? 'info'
          : altRatio === 0
            ? 'pass'
            : altRatio > 0.5
              ? 'fail'
              : 'warn',
      value: `${seo.images.missingAlt}/${seo.images.total}`,
    },
    {
      id: 'content.length',
      status:
        seo.wordCount >= THIN_CONTENT_WORDS ? 'pass' : seo.wordCount >= 50 ? 'warn' : 'fail',
      value: seo.wordCount,
    },
    { id: 'og.present', status: ogCount === 3 ? 'pass' : 'warn', value: `${ogCount}/3` },
    { id: 'twitter.present', status: twitterCount === 4 ? 'pass' : 'warn', value: `${twitterCount}/4` },
    {
      id: 'structuredData.present',
      status: seo.structuredData.length > 0 ? 'pass' : 'warn',
      value: seo.structuredData.length,
    },
    { id: 'lang.present', status: seo.lang ? 'pass' : 'warn', value: seo.lang },
    { id: 'viewport.present', status: seo.hasViewport ? 'pass' : 'warn' },
    {
      id: 'hreflang.present',
      status: seo.hreflang.length > 0 ? 'pass' : 'info',
      value: seo.hreflang.length,
    },
  ]
}

/**
 * Combine checks into a 0–100 score.
 *
 * @returns `null` when every check is informational (nothing to grade).
 */
export function scoreChecks(checks: readonly SeoCheck[]): number | null {
  let earned = 0
  let possible = 0

  for (const check of checks) {
    if (check.status === 'info') continue
    const weight = CHECK_WEIGHTS[check.id] ?? 0
    possible += weight
    if (check.status === 'pass') earned += weight
    else if (check.status === 'warn') earned += weight / 2
  }

  if (possible === 0) return null
  return Math.round((earned / possible) * 100)
}

/**
 * Score one archived page.
 *
 * @param record Archive entry (needs `url` and an optional `seo` snapshot).
 * @param context Site-wide duplicate sets.
 */
export function scorePage(
  record: Pick<UrlRecord, 'url' | 'seo'>,
  context: ScoreContext = EMPTY_SCORE_CONTEXT,
): SeoScore {
  if (!record.seo) return { score: null, checks: [] }
  const checks = evaluateChecks(record.seo, record.url, context)
  return { score: scoreChecks(checks), checks }
}