/**
 * i18n key mapping for SEO checks and report groups.
 *
 * Keeping the mapping here means the dictionaries stay flat, while TypeScript still
 * guarantees that every check and every report field has a key.
 *
 * 把 i18n 鍵的對應集中在這裡，字典可以保持扁平，同時 TypeScript 仍能保證
 * 每個檢查項與報告欄位都有對應的鍵。
 */
import type { UiKey } from '@/lib/i18n'
import type { SeoCheckId, SeoReport } from '@/types/seo'

/** Label key per check. */
export const CHECK_LABEL_KEY: Record<SeoCheckId, UiKey> = {
  'title.present': 'seo.check.titlePresent',
  'title.length': 'seo.check.titleLength',
  'title.unique': 'seo.check.titleUnique',
  'description.present': 'seo.check.descriptionPresent',
  'description.length': 'seo.check.descriptionLength',
  'description.unique': 'seo.check.descriptionUnique',
  'h1.present': 'seo.check.h1Present',
  'h1.single': 'seo.check.h1Single',
  'canonical.present': 'seo.check.canonicalPresent',
  'canonical.self': 'seo.check.canonicalSelf',
  'robots.indexable': 'seo.check.robotsIndexable',
  'images.alt': 'seo.check.imagesAlt',
  'content.length': 'seo.check.contentLength',
  'og.present': 'seo.check.ogPresent',
  'twitter.present': 'seo.check.twitterPresent',
  'structuredData.present': 'seo.check.structuredDataPresent',
  'lang.present': 'seo.check.langPresent',
  'viewport.present': 'seo.check.viewportPresent',
  'hreflang.present': 'seo.check.hreflangPresent',
}

/** Fix-hint key per check. */
export const CHECK_FIX_KEY: Record<SeoCheckId, UiKey> = {
  'title.present': 'seo.fix.titlePresent',
  'title.length': 'seo.fix.titleLength',
  'title.unique': 'seo.fix.titleUnique',
  'description.present': 'seo.fix.descriptionPresent',
  'description.length': 'seo.fix.descriptionLength',
  'description.unique': 'seo.fix.descriptionUnique',
  'h1.present': 'seo.fix.h1Present',
  'h1.single': 'seo.fix.h1Single',
  'canonical.present': 'seo.fix.canonicalPresent',
  'canonical.self': 'seo.fix.canonicalSelf',
  'robots.indexable': 'seo.fix.robotsIndexable',
  'images.alt': 'seo.fix.imagesAlt',
  'content.length': 'seo.fix.contentLength',
  'og.present': 'seo.fix.ogPresent',
  'twitter.present': 'seo.fix.twitterPresent',
  'structuredData.present': 'seo.fix.structuredDataPresent',
  'lang.present': 'seo.fix.langPresent',
  'viewport.present': 'seo.fix.viewportPresent',
  'hreflang.present': 'seo.fix.hreflangPresent',
}

/** Label key per site-wide issue list. */
export const ISSUE_LABEL_KEY: Record<keyof SeoReport, UiKey> = {
  duplicateTitles: 'seo.issue.duplicateTitles',
  duplicateDescriptions: 'seo.issue.duplicateDescriptions',
  missingTitle: 'seo.issue.missingTitle',
  missingDescription: 'seo.issue.missingDescription',
  multipleH1: 'seo.issue.multipleH1',
  notIndexable: 'seo.issue.notIndexable',
  thinContent: 'seo.issue.thinContent',
  canonicalMismatch: 'seo.issue.canonicalMismatch',
}

/** Status pill styling shared by the table and the detail panel. */
export const STATUS_STYLE: Record<'pass' | 'warn' | 'fail' | 'info', string> = {
  pass: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300',
  warn: 'bg-amber-500/20 text-amber-700 dark:text-amber-300',
  fail: 'bg-destructive/15 text-destructive',
  info: 'bg-slate-500/15 text-slate-700 dark:text-slate-300',
}

/** Score badge styling: good / needs work / poor. */
export function scoreStyle(score: number | null): string {
  if (score === null) return 'bg-slate-500/15 text-slate-700 dark:text-slate-300'
  if (score >= 80) return 'bg-emerald-500/20 text-emerald-700 dark:text-emerald-300'
  if (score >= 60) return 'bg-amber-500/20 text-amber-700 dark:text-amber-300'
  return 'bg-destructive/15 text-destructive'
}