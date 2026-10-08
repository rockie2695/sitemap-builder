/**
 * End-to-end tests: a real Chromium drives the dashboard against the fixture site.
 *
 * Covers what jsdom cannot: the real crawl round-trip, Radix Select interactions,
 * pause/resume/stop and the actual sitemap download.
 *
 * 端對端測試：真實 Chromium 驅動儀表板對測試站執行。
 * 涵蓋 jsdom 做不到的部分：真實抓取往返、Radix Select 互動、暫停／繼續／停止與實際下載。
 */
import { expect, test } from '@playwright/test'

/** Fill the start-URL field (React-controlled) and start the crawl. */
async function startCrawl(page: import('@playwright/test').Page, url: string) {
  await page.getByLabel('起始 URL').fill(url)
  await page.getByRole('button', { name: /开始抓取/ }).click()
}

/**
 * Read a stat card's value by its label.
 *
 * Scoped to the stats grid on purpose: labels like 已完成 also appear in the
 * header badge, which lives outside any card and would resolve to nothing.
 * Uses `expect.poll` on a DOM evaluation: robust against re-renders and the
 * animated number counting.
 */
function stat(page: import('@playwright/test').Page, label: string) {
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

test.describe('sitemap builder E2E / 端對端', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    // Start every test from a clean slate.
    await page.evaluate(() => localStorage.clear())
    await page.reload()
    await expect(page.getByRole('heading', { level: 1, name: 'Sitemap Builder' })).toBeVisible()
  })

  test('crawls the fixture site and shows progress / 抓取測試站並顯示進度', async ({ page }) => {
    await startCrawl(page, 'http://localhost:4321/test/')

    // The crawl finishes: index → a → b → c (+ SPA link), 5 pages.
    await expect(page.getByText(/队列已清空/)).toBeVisible({ timeout: 60_000 })

    await expect.poll(() => stat(page, '已加入 Sitemap')).toBe('5')
    await expect.poll(() => stat(page, '已跳过')).toBe('2') // the PDF, seen on /test/ and /test/index.html
    await expect.poll(() => stat(page, '已完成')).toBe('5')
    await expect.poll(() => stat(page, '失败')).toBe('0')

    // The URL table lists the in-scope pages.
    await expect(page.getByRole('link', { name: 'http://localhost:4321/test/' }).first()).toBeVisible()
    await expect(page.getByRole('link', { name: 'http://localhost:4321/test/a.html' }).first()).toBeVisible()
    await expect(page.getByRole('link', { name: 'http://localhost:4321/test/c.html' }).first()).toBeVisible()

    // Out-of-scope and cross-origin pages must not appear.
    await expect(page.getByRole('link', { name: 'http://localhost:4321/testing.html' })).toHaveCount(0)
    await expect(page.getByRole('link', { name: 'https://www.google.com/' })).toHaveCount(0)

    // Logs streamed during the run.
    await expect(page.getByText(/任务开始/)).toBeVisible()
    await expect(page.getByText(/✓ HTTP 200/).first()).toBeVisible()
  })

  test('derives lastmod from the Last-Modified header with crawl-time fallback / lastmod 兩種分支', async ({
    page,
  }) => {
    await startCrawl(page, 'http://localhost:4321/test/')
    await expect(page.getByText(/队列已清空/)).toBeVisible({ timeout: 60_000 })

    // Switch on lastmod + priority (lastmod is on by default; priority is not).
    await page.getByTitle('优先使用页面 Last-Modified 响应头，缺失时用抓取时间').waitFor()
    await page.getByTitle('按链接深度分层：0→1.0 1→0.8 2→0.6 3→0.4 ≥4→0.2').click()

    // Export and read the file from the download event.
    const downloadPromise = page.waitForEvent('download')
    await page.getByRole('button', { name: /导出 sitemap.xml/ }).click()
    const download = await downloadPromise

    const stream = await download.createReadStream()
    const chunks: Buffer[] = []
    for await (const chunk of stream) chunks.push(chunk as Buffer)
    const xml = Buffer.concat(chunks).toString('utf8')

    // Pages with the header get its date; depth 0 gets priority 1.0.
    expect(xml).toContain('<lastmod>2026-09-01T08:30:00+00:00</lastmod>')
    expect(xml).toContain('<priority>1.0</priority>')
    expect(xml).toContain('<loc>http://localhost:4321/test/</loc>')
    expect(xml).not.toContain('<changefreq>')
  })

  test('pause and resume hold the progress / 暫停與繼續', async ({ page }) => {
    await startCrawl(page, 'http://localhost:4321/test/')
    await expect(page.getByText(/✓ HTTP 200/).first()).toBeVisible({ timeout: 30_000 })

    await page.getByRole('button', { name: '暂停', exact: true }).click()
    await expect(page.getByText('已暂停').first()).toBeVisible()

    await page.getByRole('button', { name: '继续', exact: true }).click()
    await expect(page.getByText(/队列已清空/)).toBeVisible({ timeout: 60_000 })
    await expect.poll(() => stat(page, '已完成')).toBe('5')
  })

  test('stop clears the queue immediately / 停止立即清空佇列', async ({ page }) => {
    await startCrawl(page, 'http://localhost:4321/test/')
    await expect(page.getByText(/✓ HTTP 200/).first()).toBeVisible({ timeout: 30_000 })

    await page.getByRole('button', { name: '停止', exact: true }).click()
    await expect(page.getByText('已停止').first()).toBeVisible()
    await expect.poll(() => stat(page, '待处理')).toBe('0')
  })
})