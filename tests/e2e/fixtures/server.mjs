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
  // A page that links to the always-failing endpoint, used by the retry test.
  // Lives in its own directory so the main crawl is unaffected.
  mkdirSync(join(ROOT, 'retry'), { recursive: true })
  writeFileSync(
    join(ROOT, 'retry', 'index.html'),
    page('retry root', '<a href="flaky.html">flaky</a>'),
  )

  // A redirecting page, used by the redirect-exclusion test.
  mkdirSync(join(ROOT, 'redir'), { recursive: true })
  writeFileSync(join(ROOT, 'redir', 'index.html'), page('redir root', '<a href="old.html">old</a>'))
  writeFileSync(join(ROOT, 'redir', 'new.html'), page('new page', '<a href="index.html">back</a>'))

  // A directory with deliberate on-page SEO problems, used by the SEO audit test.
  mkdirSync(join(ROOT, 'seo'), { recursive: true })
  const filler = Array.from({ length: 30 }, () => 'widget workshop guide pricing maintenance delivery').join(' ')
  const head = (title, description, extra = '') =>
    '<!doctype html><html lang="en"><head><meta charset="utf-8">' +
    (title ? '<title>' + title + '</title>' : '') +
    (description ? '<meta name="description" content="' + description + '">' : '') +
    '<meta name="viewport" content="width=device-width, initial-scale=1">' + extra +
    '</head><body>'
  const body = (inner) => inner + '<p>' + filler + '</p></body></html>'

  writeFileSync(
    join(ROOT, 'seo', 'index.html'),
    head(
      'Widget workshop guide for small teams',
      'A practical guide to choosing widgets for small workshops, covering pricing, delivery and maintenance.',
    ) +
      body(
        '<h1>Widget workshop guide</h1>' +
          '<a href="no-title.html">no title</a> <a href="dup-a.html">dup a</a> ' +
          '<a href="dup-b.html">dup b</a> <a href="thin.html">thin</a>',
      ),
  )
  writeFileSync(
    join(ROOT, 'seo', 'no-title.html'),
    head('', '') + body('<a href="index.html">back</a>'),
  )
  const duplicateTitle = 'Duplicate widget page title'
  const duplicateDescription = 'This description is copied on more than one page of the site, which is exactly what the audit reports.'
  writeFileSync(
    join(ROOT, 'seo', 'dup-a.html'),
    head(duplicateTitle, duplicateDescription) + body('<h1>Duplicate A</h1><a href="index.html">back</a>'),
  )
  writeFileSync(
    join(ROOT, 'seo', 'dup-b.html'),
    head(duplicateTitle, duplicateDescription) + body('<h1>Duplicate B</h1><a href="index.html">back</a>'),
  )
  writeFileSync(
    join(ROOT, 'seo', 'thin.html'),
    '<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Thin page with two headings</title>' +
      '<meta name="robots" content="noindex"></head><body>' +
      '<h1>First heading</h1><h1>Second heading</h1><p>Short.</p><img src="/seo/pic.png">' +
      '<a href="index.html">back</a></body></html>',
  )

  // Non-ASCII paths, used by the readable-URL export test.
  mkdirSync(join(ROOT, 'zh'), { recursive: true })
  writeFileSync(join(ROOT, 'zh', 'index.html'), page('中文目录', '<a href="中文.html">中文页面</a>'))
  writeFileSync(join(ROOT, 'zh', '中文.html'), page('中文页面', '<a href="index.html">返回</a>'))

  writeFileSync(join(ROOT, 'test', 'doc.pdf'), '%PDF-1.4 fixture')
  writeFileSync(join(ROOT, 'testing.html'), page('越界页面', '<a href="/test/index.html">进入 test</a>'))
}

createServer((request, response) => {
  const url = new URL(request.url ?? '/', 'http://localhost')
  const pathname = decodeURIComponent(url.pathname)

  // A deliberately broken endpoint: drops the connection so the browser reports a
  // transport error. Used by the retry E2E test.
  if (pathname.endsWith('/flaky.html')) {
    request.socket.destroy()
    return
  }

  // A permanent redirect to a different page, used by the redirect-exclusion test.
  if (pathname === '/redir/old.html') {
    response.writeHead(301, { Location: '/redir/new.html' })
    response.end()
    return
  }

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