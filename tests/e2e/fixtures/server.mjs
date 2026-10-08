/**
 * Fixture static site for the E2E suite.
 *
 * Serves a handful of pages that exercise every crawl rule:
 *  - in-scope links, duplicates, hash links;
 *  - a non-HTML asset (skipped);
 *  - tracking params (stripped or kept per the option);
 *  - a cross-origin link and an out-of-prefix link (both dropped);
 *  - a client-side rendered link (SPA);
 *  - `Last-Modified` on most pages but not on `nohdr-*` (tests both lastmod branches).
 *
 * E2E 測試用的靜態測試站。涵蓋所有抓取規則：
 * 範圍內連結、重複、hash、非 HTML 資源（跳過）、追蹤參數、跨源與越界連結（丟棄）、
 * SPA 客戶端渲染連結，以及「大多數頁面有 Last-Modified、nohdr-* 沒有」的兩種分支。
 */
import { createReadStream, existsSync, mkdirSync, statSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:http'
import { extname, join, normalize } from 'node:path'

/** Port the Playwright config expects. */
const PORT = Number(process.env.PORT ?? 4321)
/** Directory this file lives in; pages are generated next to it. */
const ROOT = join(new URL('.', import.meta.url).pathname.replace(/^\/(?=[A-Za-z]:)/, ''), 'site')

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.pdf': 'application/pdf',
}

const page = (title, body) =>
  `<!doctype html>\n<html lang="zh-CN"><head><meta charset="utf-8"><title>${title}</title></head>\n<body>\n<h1>${title}</h1>\n${body}\n</body></html>`

/** Pages are written once at startup by the generation step below. */
function writeFixtures() {
  mkdirSync(join(ROOT, 'test'), { recursive: true })

  writeFileSync(
    join(ROOT, 'test', 'index.html'),
    page(
      '测试首页',
      [
        '<a href="a.html">页面 A</a>',
        '<a href="./a.html">页面 A（重复）</a>',
        '<a href="a.html#section">页面 A（hash）</a>',
        '<a href="doc.pdf">PDF（应跳过）</a>',
        '<a href="b.html?utm_source=weibo&page=2">页面 B（带参数）</a>',
        '<a href="https://www.google.com/">外站（应过滤）</a>',
        '<a href="/testing.html">越界（应过滤）</a>',
        '<div id="spa"></div>',
        '<script>setTimeout(() => { document.getElementById("spa").innerHTML = \'<a href="c.html">SPA 链接</a>\' }, 200)</script>',
      ].join('\n'),
    ),
  )
  writeFileSync(
    join(ROOT, 'test', 'a.html'),
    page('页面 A', '<a href="index.html">返回首页</a><a href="b.html">页面 B</a>'),
  )
  writeFileSync(
    join(ROOT, 'test', 'b.html'),
    page('页面 B', '<a href="index.html">返回首页</a>'),
  )
  writeFileSync(
    join(ROOT, 'test', 'c.html'),
    page('页面 C', '<a href="index.html">返回首页</a>'),
  )
  writeFileSync(join(ROOT, 'test', 'doc.pdf'), '%PDF-1.4 fixture')
  writeFileSync(join(ROOT, 'testing.html'), page('越界页面', '<a href="/test/index.html">进入 test</a>'))
}

createServer((request, response) => {
  const url = new URL(request.url ?? '/', 'http://localhost')
  const pathname = decodeURIComponent(url.pathname)
  const target = join(ROOT, normalize(pathname).replace(/^(\.\.[/\\])+/, ''))

  // Directories: 301 to the slashed form, then fall back to index.html.
  if (existsSync(target) && statSync(target).isDirectory()) {
    if (!pathname.endsWith('/')) {
      response.writeHead(301, { Location: `${pathname}/` })
      response.end()
      return
    }
    const index = join(target, 'index.html')
    if (!existsSync(index)) {
      response.writeHead(404, { 'Content-Type': MIME['.html'] })
      response.end(page('404', 'Not Found'))
      return
    }
    response.writeHead(200, {
      'Content-Type': MIME['.html'],
      'Last-Modified': 'Tue, 01 Sep 2026 08:30:00 GMT',
    })
    createReadStream(index).pipe(response)
    return
  }

  if (!existsSync(target)) {
    response.writeHead(404, { 'Content-Type': MIME['.html'] })
    response.end(page('404', 'Not Found'))
    return
  }

  const headers = { 'Content-Type': MIME[extname(target)] ?? 'application/octet-stream' }
  // Most pages carry Last-Modified; the nohdr pages deliberately do not, so both
  // lastmod branches (header first, crawl-time fallback) get exercised.
  if (extname(target) === '.html' && !pathname.includes('nohdr')) {
    headers['Last-Modified'] = 'Tue, 01 Sep 2026 08:30:00 GMT'
  }

  response.writeHead(200, headers)
  createReadStream(target).pipe(response)
}).listen(PORT, () => {
  writeFixtures()
  console.log(`E2E fixture site ready: http://localhost:${PORT}/test/`)
})