/**
 * Public surface of the sitemap layer.
 *
 * sitemap 層的對外介面。
 */
export { SITEMAP_MAX_URLS, SITEMAP_MAX_BYTES } from './constants'
export {
  buildSitemapIndex,
  buildSitemapXml,
  escapeXml,
  formatPriority,
} from './build'
export {
  formatW3CDateTime,
  resolveLastmod,
  toSitemapEntries,
  type SitemapEntry,
  type SitemapExportOptions,
} from './entries'
export { priorityForDepth } from './priority'
export { changefreqForDepth, resolveChangefreq, CHANGEFREQ_OPTIONS } from './changefreq'
export {
  DEFAULT_MAX_URLS_PER_FILE,
  splitSitemaps,
  toDownloadPayloads,
  type SitemapFile,
  type SplitResult,
} from './split'