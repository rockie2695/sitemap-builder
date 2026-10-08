/**
 * Playwright browser instance management.
 *
 * The original spec launched a browser per request (300–900ms startup, hundreds of
 * MB of memory each). Instead, the chromium PROCESS is a `globalThis` singleton
 * (it survives dev-mode HMR) and every request only creates a fresh
 * `BrowserContext`, which isolates cookies/localStorage at a fraction of the cost.
 *
 * Playwright 瀏覽器實例管理。
 * 原規格每個請求都要 launch + close 一次瀏覽器（啟動 300~900ms、每次數百 MB 記憶體）。
 * 這裡改為 chromium「程序」以 `globalThis` 單例複用（dev 的 HMR 也不會丟），
 * 每個請求只新建一個 `BrowserContext` 隔離 cookie／localStorage，成本低得多。
 */
import type { Browser, LaunchOptions } from 'playwright'

type BrowserGlobals = {
  /** The reused browser instance. */
  __smbBrowser?: Browser
  /** In-flight creation promise, so concurrent requests share one launch. */
  __smbCreating?: Promise<Browser>
}

const globalStore = globalThis as typeof globalThis & BrowserGlobals

/** Launch args (`--no-sandbox` et al. are required inside containers / CI). */
const LAUNCH_ARGS = [
  '--no-sandbox',
  '--disable-setuid-sandbox',
  '--disable-dev-shm-usage',
  '--disable-gpu',
]

/**
 * Get a usable browser instance, creating one when necessary.
 *
 * The `disconnected` listener forgets the dead instance so the next request
 * transparently relaunches.
 */
export async function getBrowser(): Promise<Browser> {
  const existing = globalStore.__smbBrowser
  if (existing && existing.isConnected()) return existing

  if (!globalStore.__smbCreating) {
    globalStore.__smbCreating = createBrowser()
      .then((browser) => {
        globalStore.__smbBrowser = browser
        browser.on('disconnected', () => {
          if (globalStore.__smbBrowser === browser) {
            globalStore.__smbBrowser = undefined
            globalStore.__smbCreating = undefined
          }
        })
        return browser
      })
      .catch((error: unknown) => {
        globalStore.__smbCreating = undefined
        throw error
      })
  }

  return globalStore.__smbCreating
}

/** Create the browser, honouring the remote-endpoint and custom-path env vars. */
async function createBrowser(): Promise<Browser> {
  // Dynamic import: keeps playwright server-side only, out of the client bundle.
  const { chromium } = await import('playwright')

  // Option 1: a cloud browser (Browserless / Browserbase, …).
  const remoteEndpoint = process.env.BROWSERLESS_WS_ENDPOINT
  if (remoteEndpoint) {
    return chromium.connectOverCDP(remoteEndpoint)
  }

  // Option 2: local chromium; CHROMIUM_EXECUTABLE_PATH points at a custom binary
  // (on Vercel, feed it @sparticuz/chromium's executablePath() result).
  const options: LaunchOptions = {
    headless: true,
    args: LAUNCH_ARGS,
  }
  const executablePath = process.env.CHROMIUM_EXECUTABLE_PATH
  if (executablePath) options.executablePath = executablePath

  return chromium.launch(options)
}

/** Close the browser explicitly (mainly for tests and admin scripts). */
export async function closeBrowser(): Promise<void> {
  const browser = globalStore.__smbBrowser
  globalStore.__smbBrowser = undefined
  globalStore.__smbCreating = undefined
  await browser?.close().catch(() => undefined)
}