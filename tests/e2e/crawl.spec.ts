/**
 * End-to-end tests: a real Chromium drives the dashboard against the fixture site.
 *
 * Covers what jsdom cannot: the real crawl round-trip, Radix Select interactions,
 * pause/resume/stop, retries, concurrency, i18n switching and the actual downloads.
 *
 * The Playwright `locale` is set to `zh-CN`, so the UI renders Simplified Chinese and
 * the selectors below use Chinese labels.
 *
 * 端對端測試：真實 Chromium 驅動儀表板對測試站執行。
 * 涵蓋 jsdom 做不到的部分：真實抓取、Radix Select 互動、暫停／繼續／停止、重試、
 * 並發、語系切換與實際下載。Playwright 的 `locale` 設為 `zh-CN`，
 * 因此介面為簡體中文，以下選擇器使用中文標籤。
 */
import { expect, test } from '@playwright/test'
import type { Download, Page } from '@playwright/test'

const FIXTURE = 'http://localhost:4321'

/** Fill the start-URL field (React-controlled) and start the crawl. */
async function startCrawl(page: Page, url: string) {
  await page.getByLabel('起始 URL').fill(url)
  await page.getByRole('button', { name: /开始抓取/ }).click()
}

/** Locate a stat card's value element by its Chinese label. */
function stat(page: Page, label: string) {
  return page
    .getByTestId('stats-grid')
    .getByText(label, { exact: true })
    .first()
    .evaluate((element) => {
      const card = element.closest('[data-slot="card"]')
      const paragraphs = card?.querySelectorAll('p')
      return paragraphs && paragraphs.length >= 2 ? (paragraphs[1].textContent?.trim() ?? '') : ''
    })
}

/** Click the switch that belongs to the labelled control. */
async function toggleSwitch(page: Page, label: string) {
  await page.locator('label', { hasText: label }).first().getByRole('switch').click()
}

/** Wait for the crawl to finish and return. */
async function waitForFinish(page: Page) {
  await expect(page.getByText(/队列已清空/)).toBeVisible({ timeout: 60_000 })
}

/** Read a download into a UTF-8 string. */
async function readDownload(download: Download): Promise<string> {
  const stream = await download.createReadStream()
  const chunks: Buffer[] = []
  for await (const chunk of stream) chunks.push(chunk as Buffer)
  return Buffer.concat(chunks).toString('utf8')
}

test.describe('sitemap builder E2E / 端對端', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    // Start every test from a clean slate (task snapshot, locale, view mode).
    await page.evaluate(() => localStorage.clear())
    await page.reload()
    await expect(page.getByRole('heading', { level: 1, name: 'Sitemap Builder' })).toBeVisible()
  })

  test('crawls the fixture site and shows progress / 抓取測試站並顯示進度', async ({ page }) => {
    await startCrawl(page, `${FIXTURE}/test/`)
    await waitForFinish(page)

    await expect.poll(() => stat(page, '已加入 Sitemap')).toBe('5')
    await expect.poll(() => stat(page, '已跳过')).toBe('2') // the PDF, seen on /test/ and /test/index.html
    await expect.poll(() => stat(page, '已完成')).toBe('5')
    await expect.poll(() => stat(page, '失败')).toBe('0')

    // The URL table lists the in-scope pages.
    await expect(page.getByRole('link', { name: `${FIXTURE}/test/a.html` }).first()).toBeVisible()
    await expect(page.getByRole('link', { name: `${FIXTURE}/test/c.html` }).first()).toBeVisible()

    // Out-of-scope and cross-origin pages must not appear.
    await expect(page.getByRole('link', { name: `${FIXTURE}/testing.html` })).toHaveCount(0)
    await expect(page.getByRole('link', { name: 'https://www.google.com/' })).toHaveCount(0)

    // Logs streamed during the run.
    await expect(page.getByText(/任务开始/)).toBeVisible()
    await expect(page.getByText(/✓ HTTP 200/).first()).toBeVisible()
  })

  test('derives lastmod from the Last-Modified header with crawl-time fallback / lastmod 兩種分支', async ({
    page,
  }) => {
    await startCrawl(page, `${FIXTURE}/test/`)
    await waitForFinish(page)

    // Turn priority on (lastmod is on by default) and export.
    await toggleSwitch(page, 'priority')

    const downloadPromise = page.waitForEvent('download')
    await page.getByRole('button', { name: /导出 sitemap.xml/ }).click()
    const xml = await readDownload(await downloadPromise)

    expect(xml).toContain('<lastmod>2026-09-01T08:30:00+00:00</lastmod>')
    expect(xml).toContain('<priority>1.0</priority>')
    expect(xml).toContain(`<loc>${FIXTURE}/test/</loc>`)
    expect(xml).not.toContain('<changefreq>')
  })

  test('applies the priority strategy / 依策略決定 priority', async ({ page }) => {
    await startCrawl(page, `${FIXTURE}/test/`)
    await waitForFinish(page)

    await toggleSwitch(page, 'priority')
    // Switch the strategy dropdown from link depth to absolute path depth.
    await page.getByRole('combobox', { name: 'priority' }).click()
    // `exact` matters: "按相对路径深度" also contains "按路径深度".
    await page.getByRole('option', { name: '按路径深度', exact: true }).click()

    const downloadPromise = page.waitForEvent('download')
    await page.getByRole('button', { name: /导出 sitemap.xml/ }).click()
    const xml = await readDownload(await downloadPromise)

    // `/test/` is one segment → top level → 1.0 under the path-depth ladder.
    expect(xml).toContain('<priority>1.0</priority>')
    // `/test/a.html` is two segments → 0.8 (whereas link depth would also be 0.8).
    expect(xml).toContain('<priority>0.8</priority>')
  })

  test('retries a failing page / 失敗頁面重試', async ({ page }) => {
    await page.getByLabel('失败重试').fill('1')
    await startCrawl(page, `${FIXTURE}/retry/`)
    await waitForFinish(page)

    // The flaky endpoint fails at the transport level: one retry, then failed.
    await expect(page.getByText(/重试 1\/1/)).toBeVisible()
    await expect.poll(() => stat(page, '失败')).toBe('1')
    await expect.poll(() => stat(page, '已完成')).toBe('1')
  })

  test('crawls with concurrency / 並發抓取', async ({ page }) => {
    await page.getByLabel('并发数').fill('3')
    await startCrawl(page, `${FIXTURE}/test/`)
    await waitForFinish(page)

    await expect.poll(() => stat(page, '已完成')).toBe('5')
    await expect.poll(() => stat(page, '失败')).toBe('0')
  })

  test('pause and resume hold the progress / 暫停與繼續', async ({ page }) => {
    await startCrawl(page, `${FIXTURE}/test/`)
    await expect(page.getByText(/✓ HTTP 200/).first()).toBeVisible({ timeout: 30_000 })

    await page.getByRole('button', { name: '暂停', exact: true }).click()
    await expect(page.getByText('已暂停').first()).toBeVisible()

    await page.getByRole('button', { name: '继续', exact: true }).click()
    await waitForFinish(page)
    await expect.poll(() => stat(page, '已完成')).toBe('5')
  })

  test('stop clears the queue immediately / 停止立即清空佇列', async ({ page }) => {
    await startCrawl(page, `${FIXTURE}/test/`)
    await expect(page.getByText(/✓ HTTP 200/).first()).toBeVisible({ timeout: 30_000 })

    await page.getByRole('button', { name: '停止', exact: true }).click()
    await expect(page.getByText('已停止').first()).toBeVisible()
    await expect.poll(() => stat(page, '待处理')).toBe('0')
  })

  test('switches language and remembers it / 切換語系並記住', async ({ page }) => {
    await page.getByRole('combobox').filter({ hasText: '简体中文' }).click()
    await page.getByRole('option', { name: 'English' }).click()

    await expect(page.getByRole('button', { name: /^Start$/ })).toBeVisible()
    await expect(page.getByText('Idle').first()).toBeVisible()

    // The choice survives a reload (stored locale wins over detection).
    await page.reload()
    await expect(page.getByRole('button', { name: /^Start$/ })).toBeVisible()
    await expect(page.locator('html')).toHaveAttribute('lang', 'en')
  })

  test('replaces the host in every export / 匯出時替換主機名', async ({ page }) => {
    await startCrawl(page, `${FIXTURE}/test/`)
    await waitForFinish(page)

    await page.getByLabel('替换主机名').fill('https://www.example.com')

    const xmlPromise = page.waitForEvent('download')
    await page.getByRole('button', { name: /导出 sitemap.xml/ }).click()
    const xml = await readDownload(await xmlPromise)

    expect(xml).toContain('<loc>https://www.example.com/test/</loc>')
    expect(xml).not.toContain('localhost:4321')
  })

  test('exports readable (decoded) non-ASCII URLs on request / 可讀中文 URL', async ({ page }) => {
    await startCrawl(page, `${FIXTURE}/zh/`)
    await waitForFinish(page)

    // Default: percent-encoded.
    const encodedPromise = page.waitForEvent('download')
    await page.getByRole('button', { name: /导出 sitemap.xml/ }).click()
    const encoded = await readDownload(await encodedPromise)
    expect(encoded).toContain('%E4%B8%AD%E6%96%87.html')

    // Readable: decoded path.
    await toggleSwitch(page, 'URL 显示为可读文字')
    const readablePromise = page.waitForEvent('download')
    await page.getByRole('button', { name: /导出 sitemap.xml/ }).click()
    const readable = await readDownload(await readablePromise)
    expect(readable).toContain('中文.html')
  })

  test('switches the chart period / 圖表時段切換', async ({ page }) => {
    await startCrawl(page, `${FIXTURE}/test/`)
    await expect(page.getByText(/✓ HTTP 200/).first()).toBeVisible({ timeout: 30_000 })

    const full = page.getByRole('radio', { name: '全程' })
    await full.click()
    await expect(full).toBeChecked()
    await expect(page.getByRole('radio', { name: '当前时段' })).not.toBeChecked()
  })

  test('excludes redirected pages on request / 排除重定向頁面', async ({ page }) => {
    await startCrawl(page, `${FIXTURE}/redir/`)
    await waitForFinish(page)

    // `/redir/old.html` 301s to `/redir/new.html`, so the table marks it.
    await expect(page.getByTitle('抓取时此地址被重定向到其它位置')).toBeVisible()

    // Without the switch both records are exported.
    const allPromise = page.waitForEvent('download')
    await page.getByRole('button', { name: /导出 sitemap.xml/ }).click()
    const all = await readDownload(await allPromise)
    expect(all).toContain(`${FIXTURE}/redir/old.html`)

    // With the switch on, the bounced address disappears.
    await toggleSwitch(page, '排除重定向页面')
    const filteredPromise = page.waitForEvent('download')
    await page.getByRole('button', { name: /导出 sitemap.xml/ }).click()
    const filtered = await readDownload(await filteredPromise)
    expect(filtered).not.toContain('/redir/old.html')
    expect(filtered).toContain(`${FIXTURE}/redir/`)
  })

  test('audits on-page SEO and reports site-wide issues / SEO 稽核與全站問題', async ({ page }) => {
    await startCrawl(page, `${FIXTURE}/seo/`)
    await waitForFinish(page)

    // Switch to the SEO view (the label is the same in every locale).
    await page.getByRole('radio', { name: 'SEO' }).click()

    // Six pages were crawled: /seo/ and /seo/index.html are the same file at two
    // URLs, plus no-title, dup-a, dup-b and thin.
    await expect(page.getByText('已稽核页面').locator('..')).toContainText('6')

    // Duplicates: the index pair (same file, two URLs) and the dup-a/dup-b pair.
    await expect(page.getByText('重复标题').first()).toContainText('4')
    await expect(page.getByText('缺少标题').first()).toContainText('1')
    await expect(page.getByText('多个 H1').first()).toContainText('1')
    await expect(page.getByText('禁止索引').first()).toContainText('1')

    // Opening a page shows every check with its fix hint.
    await page.getByText(`${FIXTURE}/seo/no-title.html`).first().click()
    await expect(page.getByText('本页检查项')).toBeVisible()
    await expect(page.getByText('标题标签存在')).toBeVisible()
  })

  test('adds SEO columns to the CSV export / CSV 含 SEO 欄位', async ({ page }) => {
    await startCrawl(page, `${FIXTURE}/seo/`)
    await waitForFinish(page)

    const downloadPromise = page.waitForEvent('download')
    await page.getByRole('button', { name: 'CSV' }).click()
    const csv = await readDownload(await downloadPromise)

    expect(csv).toContain('seoScore')
    expect(csv).toContain('seoTitleLength')
    // Every cell is quoted: score then title length, e.g. `"81","37",`.
    expect(csv).toMatch(/,"\d{1,3}","\d+",/)
  })

  test('checks a search ranking against a stubbed SERP / 以樁 SERP 檢查排名', async ({ page }) => {
    await startCrawl(page, `${FIXTURE}/seo/`)
    await waitForFinish(page)

    // Intercept the SERP API so no real search engine is contacted.
    await page.route('**/api/serp', async (route) => {
      const body = route.request().postDataJSON() as { query: string }
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          query: body.query,
          engine: 'google',
          provider: 'playwright',
          rank: 5,
          results: [
            { position: 1, url: 'https://top.example.com/', title: 'Top', hostname: 'top.example.com' },
          ],
          competitors: [],
        }),
      })
    })

    // SEO view → SERP sub-tab.
    await page.getByRole('radio', { name: 'SEO' }).click()
    await page.getByRole('tab', { name: 'SERP 排名' }).click()

    // A single query: the deliberate 20s interval never applies, so this is fast.
    await page.getByLabel('每次查询数').fill('1')
    await page.getByRole('button', { name: '查询排名' }).click()

    // Our own site ranks #5 in the stubbed results.
    await expect(page.getByText('第 5 名').first()).toBeVisible({ timeout: 30_000 })
  })
})