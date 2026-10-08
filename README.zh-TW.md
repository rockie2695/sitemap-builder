# Sitemap Builder（繁體中文）

以 **Next.js 16 App Router + TypeScript + Tailwind CSS v4 + shadcn/ui + Motion + Playwright** 打造的全端 Sitemap 產生器，並已啟用 **React Compiler**。

輸入起始網址 → 伺服器以無頭瀏覽器逐頁渲染並擷取連結 → 前端維護佇列、去重、即時顯示進度與日誌 → 匯出 `sitemap.xml`（單檔或拆分）、`CSV`、`JSON` 與抓取日誌。

介面提供**英文、繁體中文與簡體中文**（可切換並記住），抓取支援重試、並發、三種 `priority` 策略，匯出端的 URL 呈現也可調整。

> English documentation: [README.md](./README.md)

---

## 目錄

- [快速開始](#快速開始)
- [抓取流程說明](#抓取流程說明)
- [選項參考](#選項參考)
- [功能清單](#功能清單)
- [抓取規則](#抓取規則)
- [sitemap 的選用欄位](#sitemap-的選用欄位)
- [專案結構](#專案結構)
- [環境變數](#環境變數)
- [部署到 Vercel](#部署到-vercel)
- [改用雲端瀏覽器（Browserless）](#改用雲端瀏覽器browserless)
- [調参：並發、延遲、逾時](#調参並發延遲逾時)
- [斷點續爬](#斷點續爬)
- [測試](#測試)
- [已知限制](#已知限制)
- [授權](#授權)

---

## 快速開始

```bash
# 1. 安裝相依套件
npm install

# 2. 安裝 Playwright 的 Chromium（約 150MB，只需一次）
npx playwright install chromium

# 3. 啟動開發伺服器（Turbopack）
npm run dev
```

開啟 http://localhost:3000 ，輸入起始網址後點擊「開始抓取」。

> **Linux / CI** 還需要系統相依：`npx playwright install --with-deps chromium`
>
> **Windows** 不需要額外步驟。

抓取 `localhost`／內網站點前，先放行 SSRF 攔截：

```bash
# PowerShell
$env:ALLOW_PRIVATE_TARGETS="1"; npm run dev

# bash / zsh
ALLOW_PRIVATE_TARGETS=1 npm run dev
```

腳本：

| 腳本 | 用途 |
| --- | --- |
| `npm run dev` | 開發伺服器（Turbopack） |
| `npm run build` | 生產建置 |
| `npm run start` | 執行生產建置 |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` | ESLint CLI（Next 16 已移除 `next lint`） |
| `npm run test` | Vitest（單元 + 元件 + API 測試） |
| `npm run test:watch` | Vitest 監看模式 |
| `npm run e2e` | Playwright E2E（會先建置，見[測試](#測試)） |
| `npm run verify` | typecheck + lint + test |

---

## 抓取流程說明

**頁面是逐一處理的。** 引擎維護一個 FIFO 佇列，同一時間只發出**一個**請求，
每頁之間有禮貌延遲（預設 800ms）。這是刻意的：對目標站点的負載極小，
進度介面也易於預測。可以開並發（見[調参](#調参並發延遲逾時)），但預設關閉。

**慢的頁面（SPA／重前端 JS）分三個階段處理**（`lib/crawler/crawlPage.ts`）：

1. `goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 })`——導航本身很快就完成，
   即使腳本還在跑；
2. `waitForLoadState('networkidle', { timeout: 8000 })`——**最多等 8 秒**讓網路穩定。
   這裡逾時**不是錯誤**：SPA、埋點與輪詢會讓連線永遠不閒置；
3. `waitForTimeout(500)`——再多等一下，讓前端框架渲染出 `<a>` 元素。

三個階段後仍未穩定的頁面，會擷取已渲染的部分並回報為**部分成功**（HTTP 206）
而非失敗——連結不會浪費。要支援更重的站點，調高
`lib/crawler/crawlPage.ts` 裡的 `IDLE_TIMEOUT`／`RENDER_SETTLE`。

**瀏覽器會被複用。** chromium「程序」是 `globalThis` 單例，
每個請求只新建 `BrowserContext`（隔離 cookie），因此抓取不必每頁支付 300~900ms 的啟動成本。

**並發。** `concurrency`（1～5）可同時發出多個請求，但啟動節奏仍是全域的：
每 `delayMs` 啟動一個請求、同時最多 N 個在途。這讓目標站的負載可預期，慢頁面也能重疊處理。
每個工作使用獨立的瀏覽器 context（約 150MB），建議數值保守，Vercel 上不超過 2。

**重試。** `retryCount`（0～5）會重新排入「傳輸層失敗」的頁面（逾時、連線中斷）。
能開啟的 404 **不會**重試——那是有效回應，只會被記為失敗。重試不佔頁數預算、
沿用設定的間隔，也不計入「連續失敗自動暫停」的計數。

**重定向。** `page.goto` 會跟隨跳轉（受 Chromium 上限約束），最終狀態碼與位址會被記錄，
範圍內的最終位址會登記為已見，避免同一頁被抓兩次。`useFinalUrl` 讓匯出改用最終位址。

---

## 選項參考

介面暴露的全部選項與預設值（來源：`hooks/crawler/constants.ts` → `DEFAULT_OPTIONS`）。
所有選項都會存進任務快照，續爬時設定不會遺失。

| 選項 | 預設 | 作用 |
| --- | --- | --- |
| 保留查詢參數 | 關 | 關閉時丟棄整個 query；開啟時保留但剔除追蹤參數 |
| 最大頁數 | 1000 | 頁數預算。**重試不佔用** |
| 請求間隔 | 800 ms | 兩次請求「啟動」之間的間隔（全域節奏） |
| 並發數 | 1 | 同時在途請求數（1 = 循序，上限 5）。每個工作使用獨立瀏覽器 context（約 150MB） |
| 失敗重試 | 0 | 針對「傳輸失敗」的額外嘗試次數（上限 5）。重試沿用請求間隔，也不重置自動暫停計數 |
| `lastmod` | 開 | 輸出 `<lastmod>`（頁面 Last-Modified，缺失時用抓取時間） |
| `priority` + 策略 | 關 | 輸出 `<priority>`；策略可選連結深度／絕對路徑深度／相對路徑深度 |
| `changefreq` | 關 | 輸出 `<changefreq>`；可選固定值或「按深度自動」 |
| 排除失敗頁面 | 關 | 從所有匯出格式中排除失敗頁面 |
| 排除重定向頁面 | 關 | 排除抓取時被跳轉到其它位址的頁面（僅差末尾斜線或被剔除的查詢不算） |
| 拆分為多個文件 + 每檔上限 | 關、1000 | 超限時產生 `sitemap-1..N.xml` 與 `sitemapindex.xml` |
| URL 顯示為可讀文字 | 關 | 解碼非 ASCII 的路徑／查詢（主機維持 punycode） |
| 使用跳轉後的最終位址 | 關 | 匯出重定向後的最終位址 |
| 替換主機名 | 空 | 替換所有匯出 URL 的主機名（路徑與查詢保留） |

**優先級階梯**

| 策略 | 規則 |
| --- | --- |
| 按連結深度（預設） | 距起始頁的連結層數：0→1.0、1→0.8、2→0.6、3→0.4、≥4→0.2 |
| 按路徑深度（絕對） | URL 段數：`/` 與 `/a`→1.0、`/a/b`→0.8、`/a/b/c`→0.6、≥5 段→0.2 |
| 按路徑深度（相對） | 起始前綴以下的段數：起始頁→1.0、`/test/a`→0.8、`/test/a/b`→0.6 |

路徑深度以非空的路徑段原樣計算（檔名含擴展名照算，查詢字串忽略）。

**匯出 URL 的呈現**集中在 `lib/sitemap/url-display.ts`，`sitemap.xml`、`CSV`、`JSON` 一致：
選出來源 URL（最終或原始）→ 替換主機 → 需要時解碼。

**重定向**：`page.goto` 會跟隨跳轉，最終狀態碼與位址會被記錄，且在範圍內的最終位址會登記為已見，
避免同一頁被抓兩次。若某個連結是在其重定向目標已被抓取「之後」才被發現，仍會多花一次請求。
被重定向的記錄會標示（URL 表格中的 `↪`），可用「排除重定向頁面」開關把它們排除出匯出。

**語言**：介面有英文、繁體中文、簡體中文；選擇會被記住，否則依瀏覽器語言自動判斷。
抓取日誌、日誌匯出與錯誤訊息同樣會翻譯。

---

## 功能清單

| 區域 | 能力 |
| --- | --- |
| 輸入與控制 | 起始網址驗證（限 http/https）、開始／暫停／繼續／停止／清空 |
| 抓取選項 | 保留查詢參數開關、頁數上限（預設 1000）、請求間隔（預設 800ms） |
| 統計 | 已加入 Sitemap、待處理、抓取中、已完成、失敗、已跳過、成功率、吞吐量（頁/分）、已用時、平均每頁 |
| 當前抓取 | 目前網址 + 即時計時 + 階段步驟條（排隊 → 請求頁面 → 提取連結 → 完成） |
| 圖表 | 環形完成度 + 已完成／待處理隨時間變化面積圖（recharts） |
| URL 表格 | 狀態／網址／標題／狀態碼／深度／發現連結數／耗時；搜尋、狀態篩選、複製、新分頁開啟；**虛擬滾動** |
| 即時日誌 | 時間戳 + 等級（INFO/OK/WARN/ERROR）、等級篩選、搜尋、自動跟隨、清空、匯出 `crawl-log.txt` |
| 匯出 | `sitemap.xml`（選用 `lastmod`/`priority`/`changefreq`、拆分多檔 + `sitemapindex.xml`）、`sitemap.csv`（含 BOM）、`sitemap.json`、日誌 txt；「排除失敗」開關；拆分以 ZIP 打包 |
| 容錯 | 單頁失敗不中斷、連續 5 次失敗自動暫停、頁數上限自動停止、停止立即取消在途請求 |
| 斷點續爬 | 任務快照寫入 localStorage；重新整理後可選擇繼續 |
| 介面 | 分欄／列表／日誌檢視切換、明暗主題、數字動畫、骨架載入、固定匯出列 |

---

## 抓取規則

以 `https://www.example.com/test` 為例，自動解析出：

- `origin` = `https://www.example.com`
- `pathPrefix` = `/test`

連結處理流水線（`lib/url-utils.ts`）：

1. `<a href>` → 相對位址以當前頁解析成絕對網址
2. 丟棄 `mailto:`／`tel:`／`javascript:`／純 `#` 錨點
3. 去掉 hash
4. 查詢參數：
   - 「保留查詢參數」關閉 → **整個 query 丟棄**
   - 開啟 → 保留，但剔除追蹤參數（`utm_*`、`gclid`、`fbclid`、`ref`、`spm`…）
5. 去掉路徑末尾斜線（起始網址除外，見下）
6. 範圍：origin 相同，且 `pathname` 等於 `pathPrefix` 或以 `pathPrefix + '/'` 開頭——
   所以 `/test` **不會**誤匹配 `/testing`、`/testimonials`
7. 跳過非 HTML 文件（`.pdf` `.jpg` `.zip` `.css` `.js` `.docx`…），計入「已跳過」，不進 sitemap
8. 同一頁的重複連結自動去重

**兩個實務上容易踩的坑，這裡已處理：**

- **起始網址按輸入原樣訪問。** `https://x.com/test/` 會帶著末尾斜線訪問
  （很多靜態站點對沒有斜線的 `/test` 直接 404），並把「去斜線」的形式登記為已見，
  避免站內連到 `/test` 時又排一次隊。
- **可達的 4xx/5xx 記為失敗。** 404 頁面不會寫進 sitemap，但它鏈出的頁面仍會被抓取。

---

## sitemap 的選用欄位

匯出列底部的開關決定 `sitemap.xml` 輸出哪些欄位（同時影響 CSV／JSON 的建議值欄位）：

| 欄位 | 開關 | 取值規則 |
| --- | --- | --- |
| `lastmod` | `lastmod`（預設開） | **優先使用頁面真實的 `Last-Modified` 回應標頭**；缺失或無法解析時回退到抓取完成時間。W3C 日期時間：`2026-10-07T06:11:16+00:00` |
| `priority` | `priority`（預設關） | 深度分層：depth 0→`1.0`、1→`0.8`、2→`0.6`、3→`0.4`、≥4→`0.2`，固定一位小數 |
| `changefreq` | `changefreq`（預設關） | 下拉可選 `always`/`hourly`/`daily`/`weekly`/`monthly`/`yearly`/`never`，或「按深度自動」（0→`daily`、1→`weekly`、2→`monthly`、≥3→`yearly`） |

欄位順序遵循 sitemaps.org：`loc → lastmod → changefreq → priority`。

```xml
<url>
  <loc>https://www.example.com/test/a.html</loc>
  <lastmod>2026-09-01T08:30:00+00:00</lastmod>
  <changefreq>weekly</changefreq>
  <priority>0.8</priority>
</url>
```

**拆分為多個檔案**：開啟「拆分為多個文件」後，超過每檔上限（預設 1000，協定上限 50,000）的項目
會寫入 `sitemap-1.xml … sitemap-k.xml` 加上一份 `sitemapindex.xml`。
檔案以一個 ZIP 交付（在瀏覽器端以 `CompressionStream` 封裝，零相依套件；
不支援時退回逐一下載）。

> **關於 `priority`／`lastmod` 的實際作用**：Google 官方聲明會**忽略**這兩個欄位
> （它使用自己的抓取訊號）。它們主要對 Bing 等其它搜尋引擎有意義，
> `changefreq` 也只是提示。提供它們是為了輸出更完整的 sitemap，別指望靠它提升排名。

---

## 專案結構

```text
app/
├── layout.tsx                  # 根版面（zh-CN、TooltipProvider）
├── page.tsx                    # 渲染 <SitemapBuilder />
├── globals.css                 # Tailwind v4 入口 + shadcn 主題變數
└── api/crawl/route.ts          # 薄轉接層：zod 驗證 → SSRF → crawlPage()
components/
├── ui/                         # shadcn/ui 基礎元件（button、card、select…）
└── dashboard/
    ├── SitemapBuilder.tsx      # 版面外殼；串接引擎與各面板
    ├── DashboardHeader.tsx     # 標題、狀態徽章、主題切換
    ├── AlertsPanel.tsx         # 輸入錯誤／續爬提示／儲存失敗／使用說明
    ├── ControlPanel.tsx        # 網址欄 + 開始/暫停/停止/清空 + 抓取選項
    ├── StatsCards.tsx          # 十張統計卡（數字動畫）
    ├── CurrentJobCard.tsx      # 當前網址 + 階段步驟條 + 堆疊進度條
    ├── ProgressBar.tsx         # 可複用的堆疊進度條
    ├── ChartsPanel.tsx         # 環形完成度 + 趨勢面積圖
    ├── ViewTabs.tsx            # 分欄／列表／日誌檢視切換
    ├── UrlList.tsx             # 虛擬滾動 URL 表格
    ├── LogPanel.tsx            # 虛擬滾動即時日誌
    ├── ExportBar.tsx           # 下載按鈕 + 欄位／拆分開關
    └── AnimatedNumber.tsx      # Motion 驅動的數字滾動
hooks/
├── crawler/
│   ├── index.ts                # useCrawler()：組裝與對外 API
│   ├── constants.ts            # 上限與 DEFAULT_OPTIONS
│   ├── types.ts                # CrawlState / CrawlAction（內部）
│   ├── reducer.ts              # crawlReducer——純狀態機
│   ├── engine.ts               # 佇列 + 抓取迴圈（擁有 FIFO）
│   ├── request.ts              # /api/crawl HTTP 層 + 部分成功規則
│   └── usePersistence.ts       # 快照存取 effect
├── useVirtualWindow.ts         # 無 ref 的虛擬滾動
├── useStoredState.ts           # 以 localStorage 為後盾的 useState
└── useTheme.ts                 # 明暗主題切換
lib/
├── crawler/
│   ├── crawlPage.ts            # 伺服器端抓取（可注入瀏覽器）
│   ├── extractLinks.ts         # 連結擷取與範圍篩選
│   └── schema.ts               # API 契約的 zod schema
├── sitemap/
│   ├── index.ts                # 對外介面
│   ├── constants.ts            # sitemaps.org 上限
│   ├── entries.ts              # SitemapEntry / lastmod 解析
│   ├── priority.ts             # priorityForDepth
│   ├── changefreq.ts           # changefreqForDepth / 下拉選項
│   ├── build.ts                # XML 序列化 + sitemapindex
│   └── split.ts                # 多檔拆分
├── export/
│   ├── index.ts                # 對外介面
│   ├── csv.ts                  # CSV（BOM、CRLF）
│   ├── json.ts                 # JSON + 建議值
│   ├── log.ts                  # 日誌文字
│   ├── download.ts             # 瀏覽器下載（+ ZIP 交付）
│   ├── zip.ts                  # 零相依的 ZIP（CompressionStream）
│   └── types.ts                # DownloadPayload
├── url-utils.ts                # 解析／規範化／範圍
├── ssrf.ts                     # 私有位址判定
├── browser.ts                  # Chromium 單例
├── stats.ts                    # 衍生統計
├── persistence.ts              # localStorage 快照
├── virtual.ts                  # 虛擬滾動純函式
└── utils.ts                    # cn()
types/crawl.ts                  # 領域型別（前後端共用）
```

---

## 環境變數

| 變數 | 預設 | 用途 |
| --- | --- | --- |
| `ALLOW_PRIVATE_TARGETS` | 未設定 | `1`/`true` 放行 localhost、私有 IP 與 `169.254.x.x`。**預設關閉**：抓取 API 會代替訪客請求任意位址，沒有攔截等於開放 SSRF |
| `CHROMIUM_EXECUTABLE_PATH` | 未設定 | 指定 Chromium 執行檔路徑。Vercel 上填入 `@sparticuz/chromium` 的 `executablePath()` |
| `BROWSERLESS_WS_ENDPOINT` | 未設定 | 設定後改以 `chromium.connectOverCDP()` 連接雲端瀏覽器，不再本機啟動 |

```bash
# .env.local
ALLOW_PRIVATE_TARGETS=1
# CHROMIUM_EXECUTABLE_PATH=/tmp/chromium
# BROWSERLESS_WS_ENDPOINT=wss://xxx.browserless.io/?token=yyy
```

---

## 部署到 Vercel

Vercel 的函式環境不是普通容器：**無法安裝 Playwright 自帶的瀏覽器**，
請使用 `@sparticuz/chromium` 提供的壓縮版 Chromium。

### 1. 安裝

```bash
npm install @sparticuz/chromium
```

### 2. 在執行期取得執行檔路徑

所有瀏覽器接線集中在 `lib/browser.ts`——只需改這個檔案：

```ts
import chromium from '@sparticuz/chromium'

const executablePath = await chromium.executablePath()
const args = [...chromium.args, '--no-sandbox', '--disable-setuid-sandbox']
```

然後把路徑寫入 `CHROMIUM_EXECUTABLE_PATH`，或在 `createBrowser()` 直接呼叫
`chromium.launch({ executablePath, args })`。

### 3. 已就緒的設定

- `app/api/crawl/route.ts` 已設定 `export const maxDuration = 60`（需要 Vercel **Pro**；
  Hobby 上限較低）
- `next.config.ts` 已設定 `serverExternalPackages` 與 `outputFileTracingIncludes`，
  確保 Chromium 二進位隨建置產出
- 在 Vercel 專案設定中填入 `CHROMIUM_EXECUTABLE_PATH`

### 4. 平台限制（務必了解）

| 限制 | 影響 |
| --- | --- |
| 函式記憶體約 1024MB | Chromium 可執行，但**不要開高並發** |
| 單次呼叫 60 秒（Pro） | 把頁數上限設在 30~50 並分批抓取 |
| 冷啟動 1~3 秒 | 程序內的瀏覽器單例可在實例內攤提 |
| 長時間任務 | 抓 1000 頁請改用專用伺服器或雲端瀏覽器 |

**公網部署**：保持 `ALLOW_PRIVATE_TARGETS` 不設定。若為了抓內網必須放行，
請加上鑑權（Vercel Deployment Protection 或 API token）——
否則任何人都能透過這個應用探測你的內網。

---

## 改用雲端瀏覽器（Browserless）

1. 註冊 Browserless／Browserbase，取得 WebSocket 端點（如 `wss://chrome.browserless.io/?token=...`）
2. 設定 `BROWSERLESS_WS_ENDPOINT`
3. `lib/browser.ts` 會自動改用 `chromium.connectOverCDP(endpoint)`

想改用 `playwright-core` 搭配 Browserless 原生協定：

```ts
import { chromium } from 'playwright-core'

return chromium.connect(endpoint)
```

本機與 CI 都不必安裝瀏覽器，Vercel 的記憶體與時長限制也不再是問題——
代價是每頁多一次網路往返。

---

## 調参：並發、延遲、逾時

| 位置 | 常數 | 預設 | 用途 |
| --- | --- | --- | --- |
| `hooks/crawler/constants.ts` | `DEFAULT_OPTIONS.delayMs` | 800 | 介面可改；請求間隔 |
| `hooks/crawler/constants.ts` | `DEFAULT_OPTIONS.maxPages` | 1000 | 介面可改；自動停止上限 |
| `hooks/crawler/constants.ts` | `MAX_CONSECUTIVE_ERRORS` | 5 | 自動暫停門檻 |
| `hooks/crawler/constants.ts` | `LOG_LIMIT` | 5000 | 日誌環形緩衝上限 |
| `lib/crawler/crawlPage.ts` | `NAV_TIMEOUT` | 15000 | 導航逾時 |
| `lib/crawler/crawlPage.ts` | `IDLE_TIMEOUT` | 8000 | `networkidle` 等待上限（**逾時不是錯誤**） |
| `lib/crawler/crawlPage.ts` | `RENDER_SETTLE` | 500 | 額外的前端渲染等待 |
| `lib/crawler/crawlPage.ts` | `USER_AGENT` | `SitemapBuilder/1.0` | 建議換成更完整的 UA，避免被 WAF 攔截 |
| `lib/sitemap/split.ts` | `DEFAULT_MAX_URLS_PER_FILE` | 1000 | 拆分時每檔的 URL 上限 |

**開啟並發**（預設串行）：在 `hooks/crawler/engine.ts` 的迴圈中每輪取 N 個 URL 並發請求。
瀏覽器已是程序級單例，每個並發工作者只需多開一個 `BrowserContext`：

```ts
const CONCURRENCY = 3 // 建議不超過 4
const batch = refs.queue.current.splice(0, CONCURRENCY)
const results = await Promise.all(
  batch.map((url) => request({ url, origin: task.origin, pathPrefix: task.pathPrefix, stripQuery: options.stripQuery }, controller.signal)),
)
```

並發會佔用 N 個 context（約 N × 150MB）；Vercel 上建議不超過 2。

---

## 斷點續爬

- 抓取期間，快照（起始網址、選項、URL 檔案、佇列、最近 500 筆日誌）
  防抖寫入 `localStorage['sitemap-builder:crawl:v1']`
- 載入時若偵測到未完成任務，顯示提示列：繼續抓取或丟棄並重置
- 記錄上限 5000／佇列 5000／日誌 500；超出 localStorage 配額時降級為「不持久化」
  並在介面提示（抓取本身不受影響）

---

## 測試

```bash
npm run test      # Vitest：單元 + reducer + 元件 + API 測試（不含瀏覽器）
npm run e2e       # Playwright：真實 Chromium（會先建置）
```

| 層 | 檔案 | 涵蓋 |
| --- | --- | --- |
| 工具鏈煙霧 | `tests/toolchain.test.tsx` | Vitest + jsdom + `@/` 別名 + RTL 接線 |
| 單元 | `tests/unit/url-utils.test.ts` | 解析、規範化、範圍、追蹤參數 |
| 單元 | `tests/unit/ssrf.test.ts` | 私有主機、IPv4/IPv6、環境變數開關 |
| 單元 | `tests/unit/sitemap.test.ts` | priority（三策略）／changefreq／lastmod／XML 建構／索引／拆分 |
| 單元 | `tests/unit/url-display.test.ts` | 主機替換、可讀解碼、最終位址選擇 |
| 單元 | `tests/unit/stats.test.ts` | 衍生統計、吞吐量、**預計剩餘**、格式化 |
| 單元 | `tests/unit/charts.test.ts` | Y 軸寬度階梯與軸標籤格式 |
| 單元 | `tests/unit/i18n.test.ts` | 字典對齊、插值、日誌格式化、語系偵測 |
| 單元 | `tests/unit/export.test.ts` | CSV（BOM、引號跳脫）、JSON、日誌文字 |
| 單元 | `tests/unit/zip.test.ts` | ZIP 結構以 `inflateRawSync` 解壓驗證 |
| 單元 | `tests/unit/persistence.test.ts` | 快照往返、上限、損壞 |
| 狀態機 | `tests/unit/crawl-reducer.test.ts` | 完整生命週期、404→失敗、自動暫停、停止收尾 |
| 引擎 | `tests/unit/crawl-engine.test.ts` | 廣度優先順序、去重、斜線別名、頁數上限、暫停旗標、**重試、並發、重定向去重**（假 HTTP + 時鐘） |
| API | `tests/api/crawl-route.test.ts` | zod 400、SSRF 400、200/206/502 映射（mock 瀏覽器） |
| 元件 | `tests/components/*.test.tsx` | ControlPanel、UrlList、LogPanel、ExportBar、ViewTabs（包在 `LocaleProvider` 內） |
| E2E | `tests/e2e/crawl.spec.ts` | 真實抓取、lastmod 兩種分支、priority 策略、重試、並發、暫停／繼續／停止、語系切換、主機替換、可讀 URL、圖表時段 |

測試設定有兩件事值得知道：

- **E2E 使用生產伺服器**（`next build` + `next start -p 3100`）而非 `next dev`：
  Next 16 的鎖定檔每個專案只允許一個 dev 實例，會與你自己的開發伺服器衝突。
  測試站在 :4321 並帶 `Last-Modified` 標頭；Next 伺服器帶 `ALLOW_PRIVATE_TARGETS=1`
  （測試站位於 localhost）。
- **Radix Select 在 jsdom 無法開啟**（缺 pointer capture），
  因此元件測試只斷言其存在，實際互動由 E2E 涵蓋。

---

## 疑難排查

### `Can't resolve 'shadcn/tailwind.css'`（dev 無法編譯）

`app/globals.css` 匯入了 `shadcn/tailwind.css`，該檔案由 **shadcn CLI 套件（4.x）** 提供。
npm 上的 `shadcn@1.0.0` 是空的佔位套件——一旦被裝進來（例如手動改了版本範圍），
CSS 匯入就會解析失敗，Turbopack 於 `/app/globals.css` 報錯。

```bash
npm install -D shadcn@latest   # 必須解析到 4.x
npm ls shadcn                  # 應顯示 shadcn@4.21.x
```

`package-lock.json` 已鎖定正確版本，請勿手動改這個相依。

### `react-dom_development` chunk 出現 `Uncaught SyntaxError: Invalid or unexpected token`

兩個表面症狀、同一個成因：

- Console 在 `react-dom_development*.js` chunk 內報語法錯誤；
- 因為 React 從未完成水合，點「開始抓取」會退回**原生 GET 表單提交**，
  網址變成 `http://localhost:3000/?`。

這**不是**本應用或 `.next` 快取損壞造成的，而是 Wallaby.js **Console Ninja**
VS Code 擴充套件掛進了 `next dev`，其 **preview** 版 Turbopack 整合會回傳
**被截斷的 chunk**（檔案在某個字串中途就結束）。

任選一種修法：

- 更新 Console Ninja 擴充套件，或在此工作區停用它；
- 在 VS Code 終端機之外啟動 dev 伺服器（不會注入 build hook）；
- 清掉寫到一半的快取：`Remove-Item -Recurse -Force .next`（bash：`rm -rf .next`）。

快速確認某個 chunk 是否完整：

```bash
curl -s http://localhost:3000/_next/static/chunks/<chunk>.js -o chunk.js
node --check chunk.js   # 退出碼 0 = 語法正確
```

---

## 已知限制

- 抓取範圍永遠是起始網址自身的 `origin` + `pathPrefix`：**不做跨域抓取**，外站連結會被丟棄
- 不會讀取目標站点的 `robots.txt`
- 不解析、不匯入現有的 `sitemap.xml`／sitemap index
- `lastmod` 只能反映 `Last-Modified` 標頭或抓取時間——拿不到內容的真實修改歷史；
  `priority` 是依深度推導的啟發值，不是人工權重
- 起始網址自身的路徑就是抓取範圍：`https://x.com/blog/post-1` 只抓該子樹；
  要涵蓋 `/blog` 請輸入目錄位址
- 可讀 URL 只解碼路徑與查詢，**主機仍維持 punycode**（`xn--…`），因為瀏覽器沒有 IDN 解碼 API
- 趨勢圖每秒取樣、最多保留 1 小時；更久的任務會丟棄最舊的取樣點
- 不支援需要登入的頁面（cookie／Basic Auth／登入狀態）
- 斷點續爬受 localStorage 配額限制；超大任務請分批
- TypeScript 釘在 **5.9**：原生 `typescript@7` 編譯器尚未被 typescript-eslint 支援，
  會導致 `npm run lint` 失敗

---

## 授權

[MIT](./LICENSE) © 2026 rocki
