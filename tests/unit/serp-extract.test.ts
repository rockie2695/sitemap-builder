/**
 * Unit tests for SERP extraction (pure jsdom, no browser).
 *
 * SERP 擷取的單元測試（純 jsdom，不啟動瀏覽器）。
 */
import { describe, expect, it } from 'vitest'

import { buildSerpUrl, collectSerpResults, detectSerpBlock } from '@/lib/serp/extract'

/** Build a detached document from an HTML fragment. */
function docWith(bodyHtml: string): Document {
  const doc = document.implementation.createHTMLDocument('serp')
  doc.body.innerHTML = bodyHtml
  return doc
}

describe('collectSerpResults / 擷取自然結果', () => {
  it('keeps organic results in order and skips engine + ad links / 保留自然結果、略過引擎與廣告', () => {
    const doc = docWith(`
      <div>
        <a href="https://www.example.com/page">Result one</a>
        <a href="https://www.google.com/search?q=x">Google nav</a>
        <a href="https://www.gstatic.com/x">Static asset</a>
        <div data-text-ad><a href="https://ads.example.net/promo">Sponsored</a></div>
        <a href="https://www.google.com/url?q=https://second.example.org/article&sa=u">Wrapped</a>
      </div>
    `)

    const results = collectSerpResults(doc)
    expect(results.map((result) => result.hostname)).toEqual(['www.example.com', 'second.example.org'])
    expect(results[0].position).toBe(1)
    expect(results[1].position).toBe(2)
    expect(results[0].title).toBe('Result one')
  })

  it('de-duplicates and numbers positions / 去重並重新編號', () => {
    const doc = docWith(`
      <a href="https://a.example.com/1">One</a>
      <a href="https://b.example.com/2">Two</a>
      <a href="https://a.example.com/1">One again</a>
    `)
    const results = collectSerpResults(doc)
    expect(results).toHaveLength(2)
    expect(results.map((result) => result.position)).toEqual([1, 2])
  })

  it('prefers a heading as the result title / 以標題元素作為結果標題', () => {
    const doc = docWith(`<a href="https://a.example.com/1"><h3>Deep title</h3></a>`)
    expect(collectSerpResults(doc)[0].title).toBe('Deep title')
  })

  it('ignores non-http links / 略過非 http 連結', () => {
    const doc = docWith(`
      <a href="mailto:hi@example.com">Mail</a>
      <a href="#section">Anchor</a>
      <a href="javascript:void(0)">JS</a>
      <a href="https://ok.example.com/">OK</a>
    `)
    expect(collectSerpResults(doc)).toHaveLength(1)
  })
})

describe('detectSerpBlock / 封鎖偵測', () => {
  it('flags a CAPTCHA / unusual-traffic page / 偵測驗證碼與異常流量頁', () => {
    expect(detectSerpBlock(docWith('Our systems have detected unusual traffic from your network'))).not.toBeNull()
    expect(detectSerpBlock(docWith('<p>Please complete the CAPTCHA to continue</p>'))).not.toBeNull()
  })

  it('returns null for a normal results page / 正常結果頁回傳 null', () => {
    expect(detectSerpBlock(docWith('<a href="https://a.example.com/">A</a>'))).toBeNull()
  })
})

describe('buildSerpUrl / 建構搜尋網址', () => {
  it('encodes the query per engine / 依引擎編碼查詢', () => {
    expect(buildSerpUrl('google', 'hello world')).toContain('google.com/search')
    expect(buildSerpUrl('google', 'hello world')).toContain('q=hello%20world')
    expect(buildSerpUrl('bing', 'café')).toContain('bing.com/search')
  })
})