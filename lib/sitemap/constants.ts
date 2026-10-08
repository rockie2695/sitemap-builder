/**
 * Hard limits imposed by the sitemaps.org protocol.
 *
 * sitemaps.org 協定層面的硬性上限。
 */

/** Maximum URLs in one sitemap file (also the maximum in one sitemap index). */
export const SITEMAP_MAX_URLS = 50_000

/** Maximum uncompressed size of one sitemap file, in bytes. */
export const SITEMAP_MAX_BYTES = 50 * 1024 * 1024