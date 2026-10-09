/**
 * Unit tests for `collectSeoFromDocument`.
 *
 * The collector is self-contained (it is handed to `page.evaluate`), so the tests
 * simply parse HTML with jsdom's `DOMParser` and call it directly — no browser.
 *
 * `collectSeoFromDocument` 的單元測試。採集函式自足（要交給 `page.evaluate`），
 * 因此測試只要用 jsdom 的 `DOMParser` 解析 HTML 再直接呼叫即可——不需要瀏覽器。
 */
import { describe, expect, it } from 'vitest'

import { collectSeoFromDocument, countWordsInText, isCjkChar } from '@/lib/crawler/seoDocument'

/** Parse an HTML string into a Document. */
function parse(html: string): Document {
  return new DOMParser().parseFromString(html, 'text/html')
}

/** A page with a bit of everything. */
const RICH = `<!doctype html>
<html lang="en">
  <head>
    <base href="https://example.com/dir/" />
    <title>Widgets for small workshops</title>
    <meta name="description" content="A practical guide to choosing widgets for small workshops, with prices and maintenance tips." />
    <link rel="canonical" href="../widgets.html" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta property="og:title" content="Widgets" />
    <meta property="og:description" content="Widget guide" />
    <meta property="og:image" content="/og.png" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="Widgets" />
    <meta name="twitter:description" content="Widget guide" />
    <meta name="twitter:image" content="/tw.png" />
    <link rel="alternate" hreflang="en" href="https://example.com/en/widgets" />
    <link rel="alternate" hreflang="zh-Hant" href="https://example.com/zh/widgets" />
    <script type="application/ld+json">
      { "@context": "https://schema.org", "@graph": [ { "@type": "Article" }, { "@type": "BreadcrumbList" } ] }
    </script>
  </head>
  <body>
    <h1>Choosing widgets</h1>
    <h2>Budget</h2>
    <h3>Entry level</h3>
    <p>widgets widgets widgets workshop workshop workshop guide guide guide</p>
    <img src="a.png" alt="A widget" />
    <img src="b.png" />
    <a href="other.html">internal</a>
    <a href="https://other.test/page" rel="nofollow">external</a>
    <a href="mailto:x@example.com">mail</a>
    <a href="#top">anchor</a>
  </body>
</html>`

describe('collectSeoFromDocument / 單頁採集', () => {
  it('reads the head metadata / 讀取 head 後設資料', () => {
    const seo = collectSeoFromDocument(parse(RICH))
    expect(seo.title).toBe('Widgets for small workshops')
    expect(seo.titleLength).toBe(27)
    expect(seo.metaDescription).toMatch(/practical guide/)
    expect(seo.metaDescriptionLength).toBe(seo.metaDescription?.length)
    expect(seo.lang).toBe('en')
    expect(seo.hasViewport).toBe(true)
    expect(seo.metaRobots).toBeNull()
    expect(seo.indexable).toBe(true)
  })

  it('resolves the canonical against the base / 依 base 解析 canonical', () => {
    expect(collectSeoFromDocument(parse(RICH)).canonical).toBe('https://example.com/widgets.html')
  })

  it('collects headings and h1 / 收集標題層級與 h1', () => {
    const seo = collectSeoFromDocument(parse(RICH))
    expect(seo.h1).toEqual(['Choosing widgets'])
    expect(seo.headings.map((heading) => heading.level)).toEqual([1, 2, 3])
  })

  it('flags social tags / 標記社群標籤', () => {
    const seo = collectSeoFromDocument(parse(RICH))
    expect(seo.openGraph).toEqual({ title: true, description: true, image: true })
    expect(seo.twitter).toEqual({ card: true, title: true, description: true, image: true })
  })

  it('counts images without alt / 統計缺少 alt 的圖片', () => {
    const seo = collectSeoFromDocument(parse(RICH))
    expect(seo.images).toEqual({ total: 2, missingAlt: 1 })
  })

  it('classifies internal, external and nofollow links / 分類內外鏈與 nofollow', () => {
    const seo = collectSeoFromDocument(parse(RICH))
    // mailto and the bare anchor are ignored.
    expect(seo.links).toEqual({ internal: 1, external: 1, nofollow: 1 })
  })

  it('extracts JSON-LD types including @graph / 擷取 JSON-LD 型別（含 @graph）', () => {
    expect(collectSeoFromDocument(parse(RICH)).structuredData).toEqual(['Article', 'BreadcrumbList'])
  })

  it('collects hreflang values / 收集 hreflang', () => {
    expect(collectSeoFromDocument(parse(RICH)).hreflang).toEqual(['en', 'zh-Hant'])
  })

  it('ranks keywords and drops stopwords / 排序關鍵詞並剔除停用詞', () => {
    const seo = collectSeoFromDocument(parse(RICH))
    // The h1 counts too: "Choosing widgets" + three in the paragraph.
    expect(seo.keywords[0]).toEqual({ term: 'widgets', count: 4 })
    expect(seo.keywords.some((keyword) => keyword.term === 'for')).toBe(false)
  })

  it('handles CJK with bigrams / 以二元組處理中文', () => {
    const seo = collectSeoFromDocument(
      parse('<html lang="zh"><head><title>中醫診所</title></head><body>中醫診所 中醫診所 中醫調理</body></html>'),
    )
    expect(seo.keywords.some((keyword) => keyword.term === '中醫')).toBe(true)
    expect(seo.wordCount).toBeGreaterThan(0)
  })

  it('detects noindex / 偵測 noindex', () => {
    const seo = collectSeoFromDocument(
      parse('<html><head><title>t</title><meta name="robots" content="noindex, follow" /></head><body>x</body></html>'),
    )
    expect(seo.indexable).toBe(false)
    expect(seo.metaRobots).toBe('noindex, follow')
  })

  it('degrades gracefully on an empty document / 空文件時安全退化', () => {
    const seo = collectSeoFromDocument(parse('<html><head></head><body></body></html>'))
    expect(seo.title).toBeNull()
    expect(seo.titleLength).toBe(0)
    expect(seo.metaDescription).toBeNull()
    expect(seo.h1).toEqual([])
    expect(seo.canonical).toBeNull()
    expect(seo.images).toEqual({ total: 0, missingAlt: 0 })
    expect(seo.links).toEqual({ internal: 0, external: 0, nofollow: 0 })
    expect(seo.keywords).toEqual([])
    expect(seo.structuredData).toEqual([])
  })

  it('ignores invalid JSON-LD / 忽略壞掉的 JSON-LD', () => {
    const seo = collectSeoFromDocument(
      parse('<html><head><title>t</title><script type="application/ld+json">{oops</script></head><body>x</body></html>'),
    )
    expect(seo.structuredData).toEqual([])
  })

  it('caps the number of collected items / 限制收集數量', () => {
    const manyImages = Array.from({ length: 20 }, () => '<img src="x.png">').join('')
    const manyH1 = Array.from({ length: 15 }, (_, index) => `<h1>h${index}</h1>`).join('')
    const seo = collectSeoFromDocument(parse(`<html><head><title>t</title></head><body>${manyH1}${manyImages}</body></html>`))
    expect(seo.h1.length).toBeLessThanOrEqual(10)
    expect(seo.headings.length).toBeLessThanOrEqual(50)
    expect(seo.images.total).toBe(20)
  })
})

describe('word counting helpers / 字數輔助', () => {
  it('counts latin words and CJK characters / 計算拉丁詞與中日韓字元', () => {
    expect(countWordsInText('hello world')).toBe(2)
    expect(countWordsInText('中文字')).toBe(3)
    expect(countWordsInText('hello 中文')).toBe(3)
    expect(countWordsInText('   ')).toBe(0)
  })

  it('recognises CJK ranges / 辨識 CJK 範圍', () => {
    expect(isCjkChar('中')).toBe(true)
    expect(isCjkChar('あ')).toBe(true)
    expect(isCjkChar('한')).toBe(true)
    expect(isCjkChar('a')).toBe(false)
  })
})