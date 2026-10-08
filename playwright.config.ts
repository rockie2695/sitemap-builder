/**
 * Playwright configuration for the E2E suite.
 *
 * Two servers are started:
 *  - the fixture site on :4321 (the crawl target);
 *  - the production Next.js server on :3100.
 *
 * The production server (not `next dev`) is used deliberately: Next 16 keeps a
 * lockfile that prevents a second dev instance per project, so E2E would clash with
 * a developer's own `npm run dev`. A build is required first.
 *
 * E2E 設定。啟動兩個伺服器：:4321 的測試站（抓取目標）與 :3100 的生產版 Next.js。
 * 刻意使用生產伺服器而非 `next dev`：Next 16 有鎖定檔機制，
 * 每個專案只允許一個 dev 實例，會與開發者自己的 `npm run dev` 衝突，需先建置。
 */
import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 120_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:3100',
    trace: 'retain-on-failure',
    locale: 'zh-CN',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: [
    {
      command: 'node tests/e2e/fixtures/server.mjs',
      port: 4321,
      reuseExistingServer: true,
      timeout: 30_000,
    },
    {
      command: 'npm run start -- -p 3100',
      port: 3100,
      reuseExistingServer: true,
      timeout: 60_000,
      // The crawl target is the fixture site on localhost, so the SSRF policy
      // must be relaxed for E2E (the block itself is covered by the API tests).
      env: { ALLOW_PRIVATE_TARGETS: '1' },
    },
  ],
})