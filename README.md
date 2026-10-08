# Sitemap Builder

A full-stack sitemap generator built with **Next.js 16 App Router + TypeScript + Tailwind CSS v4 + shadcn/ui + Motion + Playwright**, with the **React Compiler** enabled.

Enter a start URL → the server renders each page in a headless browser and extracts its links → the client maintains a queue, deduplicates, and shows live progress and logs → export `sitemap.xml` (single or split), `CSV`, `JSON` and the crawl log.

> 繁體中文文件：[README.zh-TW.md](./README.zh-TW.md)

---

## Table of Contents

- [Quick Start](#quick-start)
- [How the Crawl Works](#how-the-crawl-works)
- [Feature Matrix](#feature-matrix)
- [Crawl Rules](#crawl-rules)
- [Optional Sitemap Fields](#optional-sitemap-fields)
- [Project Structure](#project-structure)
- [Environment Variables](#environment-variables)
- [Deploying to Vercel](#deploying-to-vercel)
- [Switching to a Cloud Browser (Browserless)](#switching-to-a-cloud-browser-browserless)
- [Tuning: Concurrency, Delay, Timeout](#tuning-concurrency-delay-timeout)
- [Resume After Refresh](#resume-after-refresh)
- [Testing](#testing)
- [Known Limitations](#known-limitations)

---

## Quick Start

```bash
# 1. Install dependencies
npm install

# 2. Install Playwright's Chromium (~150MB, once)
npx playwright install chromium

# 3. Start the dev server (Turbopack)
npm run dev
```

Open http://localhost:3000 , enter a start URL and press 开始抓取 (Start).

> **Linux / CI** also needs system dependencies: `npx playwright install --with-deps chromium`
>
> **Windows** needs nothing extra.

To crawl `localhost` / intranet sites, relax the SSRF guard first:

```bash
# PowerShell
$env:ALLOW_PRIVATE_TARGETS="1"; npm run dev

# bash / zsh
ALLOW_PRIVATE_TARGETS=1 npm run dev
```

Scripts:

| Script | What it does |
| --- | --- |
| `npm run dev` | Dev server (Turbopack) |
| `npm run build` | Production build |
| `npm run start` | Serve the production build |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` | ESLint CLI (Next 16 removed `next lint`) |
| `npm run test` | Vitest (unit + component + API tests) |
| `npm run test:watch` | Vitest in watch mode |
| `npm run e2e` | Playwright E2E (builds first — see [Testing](#testing)) |
| `npm run verify` | typecheck + lint + test |

---

## How the Crawl Works

**Pages are processed one by one.** The engine keeps a FIFO queue and issues exactly
one request at a time, with a politeness delay (default 800ms) between pages. This
is deliberate: it keeps the load on the target site negligible and makes the
progress UI trivially predictable. Concurrency is possible (see
[Tuning](#tuning-concurrency-delay-timeout)) but off by default.

**Slow pages (SPA / heavy client-side JS) are handled in three stages**
(`lib/crawler/crawlPage.ts`):

1. `goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 })` — the navigation
   itself succeeds quickly, even if scripts are still running;
2. `waitForLoadState('networkidle', { timeout: 8000 })` — wait **up to** 8s for the
   network to settle. Timing out here is **not an error**: SPAs, beacons and
   polling keep a connection busy forever;
3. `waitForTimeout(500)` — one extra beat so client-side frameworks can render
   their `<a>` elements.

If a page still has not settled after all that, whatever rendered so far is
extracted and the page is reported as a **partial success** (HTTP 206) instead of a
failure — the links are not wasted. To support heavier sites, raise
`IDLE_TIMEOUT` / `RENDER_SETTLE` in `lib/crawler/crawlPage.ts`.

**The browser is reused.** The chromium *process* is a `globalThis` singleton and
each request only creates a fresh `BrowserContext` (isolated cookies), so a crawl
does not pay the 300–900ms launch cost per page.

---

## Feature Matrix

| Area | Capabilities |
| --- | --- |
| Input & control | Start-URL validation (http/https only), Start / Pause / Resume / Stop / Clear |
| Crawl options | Keep-query-strings switch, page budget (default 1000), request delay (default 800ms) |
| Statistics | Added to sitemap, pending, crawling, done, failed, skipped, success rate, throughput (pages/min), elapsed, average per page |
| Current job | Current URL + live timer + stage stepper (queue → request → extract → done) |
| Charts | Radial completion gauge + done/pending area chart over time (recharts) |
| URL table | Status / URL / title / HTTP code / depth / links found / duration; search, status filter, copy, open in new tab; **virtual scrolling** |
| Live logs | Timestamp + level (INFO/OK/WARN/ERROR), level filter, search, auto-follow, clear, export `crawl-log.txt` |
| Exports | `sitemap.xml` (optional `lastmod`/`priority`/`changefreq`, split into files + `sitemapindex.xml`), `sitemap.csv` (with BOM), `sitemap.json`, log txt; "exclude failed" switch; ZIP bundling for splits |
| Resilience | A failed page never stops the crawl; 5 consecutive failures auto-pause; the page budget auto-stops; Stop aborts in-flight requests immediately |
| Resume | Task snapshot in localStorage; a refresh offers to continue |
| UI/UX | Split / list / logs view tabs, light/dark theme, animated counters, skeleton loading, sticky export bar |

---

## Crawl Rules

For `https://www.example.com/test` the app derives:

- `origin` = `https://www.example.com`
- `pathPrefix` = `/test`

Link pipeline (`lib/url-utils.ts`):

1. `<a href>` → resolve relative hrefs against the current page
2. Drop `mailto:` / `tel:` / `javascript:` / bare `#` anchors
3. Strip the hash
4. Query strings:
   - "Keep query strings" OFF → the **whole query is dropped**
   - ON → kept, minus tracking params (`utm_*`, `gclid`, `fbclid`, `ref`, `spm`…)
5. Strip the trailing slash (except the start URL, see below)
6. Scope: same origin, and `pathname` equals `pathPrefix` or starts with
   `pathPrefix + '/'` — so `/test` does **not** match `/testing` or `/testimonials`
7. Skip non-HTML documents (`.pdf` `.jpg` `.zip` `.css` `.js` `.docx`…); counted as
   "skipped", never in the sitemap
8. Duplicate links on the same page are deduplicated

**Two details that bite in practice, handled here:**

- **The start URL is opened as typed.** `https://x.com/test/` is visited with its
  trailing slash (many static sites 404 on `/test` without one), and its
  slash-stripped form is registered as seen so an in-site link to `/test` does not
  re-queue the same page.
- **A reachable 4xx/5xx counts as failed.** A 404 page is never written into the
  sitemap, but the links it points to are still crawled.

---

## Optional Sitemap Fields

The switches at the bottom of the export bar control what `sitemap.xml` contains
(they also feed the suggested-value columns in CSV / JSON):

| Field | Switch | Value rule |
| --- | --- | --- |
| `lastmod` | `lastmod` (default on) | **The page's real `Last-Modified` response header first**; falls back to the crawl finish time when missing/unparseable. W3C date-time: `2026-10-07T06:11:16+00:00` |
| `priority` | `priority` (default off) | Depth ladder: depth 0→`1.0`, 1→`0.8`, 2→`0.6`, 3→`0.4`, ≥4→`0.2`, always one decimal |
| `changefreq` | `changefreq` (default off) | Dropdown: `always`/`hourly`/`daily`/`weekly`/`monthly`/`yearly`/`never`, or "auto by depth" (0→`daily`, 1→`weekly`, 2→`monthly`, ≥3→`yearly`) |

Field order follows sitemaps.org: `loc → lastmod → changefreq → priority`.

```xml
<url>
  <loc>https://www.example.com/test/a.html</loc>
  <lastmod>2026-09-01T08:30:00+00:00</lastmod>
  <changefreq>weekly</changefreq>
  <priority>0.8</priority>
</url>
```

**Split into multiple files**: with 拆分为多个文件 on, entries beyond the per-file
limit (default 1000, protocol max 50,000) are written to `sitemap-1.xml …
sitemap-k.xml` plus a `sitemapindex.xml`. The files are delivered as one ZIP
(built in the browser via `CompressionStream`, zero dependencies; falls back to
sequential downloads when unsupported).

> **Reality check on `priority` / `lastmod`**: Google officially **ignores** both
> (it uses its own crawl signals). They matter for Bing and other engines, and
> `changefreq` is a hint at best. They are provided for completeness — do not
> expect a ranking boost.

---

## Project Structure

```text
app/
├── layout.tsx                  # Root layout (zh-CN, TooltipProvider)
├── page.tsx                    # Renders <SitemapBuilder />
├── globals.css                 # Tailwind v4 entry + shadcn theme variables
└── api/crawl/route.ts          # Thin adapter: zod validation → SSRF → crawlPage()
components/
├── ui/                         # shadcn/ui primitives (button, card, select, …)
└── dashboard/
    ├── SitemapBuilder.tsx      # Layout shell; wires the engine to the panels
    ├── DashboardHeader.tsx     # Title, phase badge, theme toggle
    ├── AlertsPanel.tsx         # Input error / restore banner / persistence error / hint
    ├── ControlPanel.tsx        # URL field + Start/Pause/Stop/Clear + crawl options
    ├── StatsCards.tsx          # Ten stat cards with animated numbers
    ├── CurrentJobCard.tsx      # Current URL + stage stepper + stacked progress
    ├── ProgressBar.tsx         # Reusable stacked progress bar
    ├── ChartsPanel.tsx         # Radial gauge + trend area chart
    ├── ViewTabs.tsx            # Split / list / logs view switch
    ├── UrlList.tsx             # Virtual-scrolled URL table
    ├── LogPanel.tsx            # Virtual-scrolled live log
    ├── ExportBar.tsx           # Download buttons + field/split switches
    └── AnimatedNumber.tsx      # Motion-powered count-up number
hooks/
├── crawler/
│   ├── index.ts                # useCrawler(): composition + public API
│   ├── constants.ts            # Limits and DEFAULT_OPTIONS
│   ├── types.ts                # CrawlState / CrawlAction (internal)
│   ├── reducer.ts              # crawlReducer — pure state machine
│   ├── engine.ts               # Queue + crawl loop (owns the FIFO)
│   ├── request.ts              # /api/crawl HTTP layer + partial-success rules
│   └── usePersistence.ts       # Snapshot save/restore effects
├── useVirtualWindow.ts         # Ref-free virtual scrolling
├── useStoredState.ts           # useState backed by localStorage
└── useTheme.ts                 # Light/dark switching
lib/
├── crawler/
│   ├── crawlPage.ts            # Server-side page fetch (injectable browser)
│   ├── extractLinks.ts         # Link extraction and scoping
│   └── schema.ts               # zod schemas for the API contract
├── sitemap/
│   ├── index.ts                # Public surface
│   ├── constants.ts            # sitemaps.org limits
│   ├── entries.ts              # SitemapEntry / lastmod resolution
│   ├── priority.ts             # priorityForDepth
│   ├── changefreq.ts           # changefreqForDepth / dropdown options
│   ├── build.ts                # XML serialisation + sitemapindex
│   └── split.ts                # Multi-file splitting
├── export/
│   ├── index.ts                # Public surface
│   ├── csv.ts                  # CSV (BOM, CRLF)
│   ├── json.ts                 # JSON + suggested values
│   ├── log.ts                  # Log text
│   ├── download.ts             # Browser downloads (+ ZIP delivery)
│   ├── zip.ts                  # Zero-dependency ZIP via CompressionStream
│   └── types.ts                # DownloadPayload
├── url-utils.ts                # Parsing / normalization / scoping
├── ssrf.ts                     # Private-host detection
├── browser.ts                  # Chromium singleton
├── stats.ts                    # Derived statistics
├── persistence.ts              # localStorage snapshots
├── virtual.ts                  # Virtual-scroll pure helpers
└── utils.ts                    # cn()
types/crawl.ts                  # Domain types (client + server)
```

---

## Environment Variables

| Variable | Default | Purpose |
| --- | --- | --- |
| `ALLOW_PRIVATE_TARGETS` | unset | `1`/`true` allows localhost, private IPs and `169.254.x.x`. **Off by default**: the API fetches arbitrary URLs on behalf of visitors, so without it the app is an SSRF hazard |
| `CHROMIUM_EXECUTABLE_PATH` | unset | Path to a Chromium binary. On Vercel, feed it `@sparticuz/chromium`'s `executablePath()` |
| `BROWSERLESS_WS_ENDPOINT` | unset | When set, the app connects to a cloud browser via `chromium.connectOverCDP()` instead of launching one |

```bash
# .env.local
ALLOW_PRIVATE_TARGETS=1
# CHROMIUM_EXECUTABLE_PATH=/tmp/chromium
# BROWSERLESS_WS_ENDPOINT=wss://xxx.browserless.io/?token=yyy
```

---

## Deploying to Vercel

Vercel functions are not regular containers: **Playwright's own browser cannot be
installed**, so use the compressed Chromium from `@sparticuz/chromium`.

### 1. Install

```bash
npm install @sparticuz/chromium
```

### 2. Resolve the executable path at runtime

All the browser wiring lives in `lib/browser.ts` — change only this file:

```ts
import chromium from '@sparticuz/chromium'

const executablePath = await chromium.executablePath()
const args = [...chromium.args, '--no-sandbox', '--disable-setuid-sandbox']
```

Then either write the path into `CHROMIUM_EXECUTABLE_PATH`, or call
`chromium.launch({ executablePath, args })` directly in `createBrowser()`.

### 3. Configuration already in place

- `app/api/crawl/route.ts` sets `export const maxDuration = 60` (Vercel **Pro**;
  Hobby is capped lower)
- `next.config.ts` sets `serverExternalPackages` and `outputFileTracingIncludes` so
  the Chromium binary ships with the build
- Set `CHROMIUM_EXECUTABLE_PATH` in the Vercel project settings

### 4. Platform limits (know these)

| Limit | Impact |
| --- | --- |
| ~1024MB function memory | Chromium runs, but **do not enable high concurrency** |
| 60s per invocation (Pro) | Keep the page budget at 30–50 per request and crawl in batches |
| 1–3s cold start | The in-process browser singleton amortises this within an instance |
| Long tasks | A 1000-page crawl belongs on a dedicated server or a cloud browser |

**Public deployments**: keep `ALLOW_PRIVATE_TARGETS` unset. If you must relax it to
crawl an intranet, add authentication (Vercel Deployment Protection or an API
token) — otherwise anyone can probe your network through this app.

---

## Switching to a Cloud Browser (Browserless)

1. Sign up at Browserless / Browserbase and copy the WebSocket endpoint
   (e.g. `wss://chrome.browserless.io/?token=...`)
2. Set `BROWSERLESS_WS_ENDPOINT`
3. `lib/browser.ts` switches to `chromium.connectOverCDP(endpoint)` automatically

To use `playwright-core` with Browserless's native protocol instead:

```ts
import { chromium } from 'playwright-core'

return chromium.connect(endpoint)
```

No browsers to install locally or in CI, and Vercel's memory/time limits stop
mattering — at the cost of one network round-trip per page.

---

## Tuning: Concurrency, Delay, Timeout

| Location | Constant | Default | Purpose |
| --- | --- | --- | --- |
| `hooks/crawler/constants.ts` | `DEFAULT_OPTIONS.delayMs` | 800 | UI-editable; delay between requests |
| `hooks/crawler/constants.ts` | `DEFAULT_OPTIONS.maxPages` | 1000 | UI-editable; auto-stop budget |
| `hooks/crawler/constants.ts` | `MAX_CONSECUTIVE_ERRORS` | 5 | Auto-pause threshold |
| `hooks/crawler/constants.ts` | `LOG_LIMIT` | 5000 | Log ring-buffer cap |
| `lib/crawler/crawlPage.ts` | `NAV_TIMEOUT` | 15000 | Navigation timeout |
| `lib/crawler/crawlPage.ts` | `IDLE_TIMEOUT` | 8000 | Upper bound for `networkidle` (**timing out is not an error**) |
| `lib/crawler/crawlPage.ts` | `RENDER_SETTLE` | 500 | Extra client-render wait |
| `lib/crawler/crawlPage.ts` | `USER_AGENT` | `SitemapBuilder/1.0` | Consider a fuller UA to avoid WAF blocks |
| `lib/sitemap/split.ts` | `DEFAULT_MAX_URLS_PER_FILE` | 1000 | Per-file URL cap for splits |

**Enabling concurrency** (serial by default): in `hooks/crawler/engine.ts`, take N
URLs per iteration and request them in parallel. The browser is already a process
singleton, so each concurrent worker only needs another `BrowserContext`:

```ts
const CONCURRENCY = 3 // keep ≤ 4
const batch = refs.queue.current.splice(0, CONCURRENCY)
const results = await Promise.all(
  batch.map((url) => request({ url, origin: task.origin, pathPrefix: task.pathPrefix, stripQuery: options.stripQuery }, controller.signal)),
)
```

Concurrency occupies N contexts (~N × 150MB); on Vercel keep it at 2.

---

## Resume After Refresh

- While crawling, a snapshot (start URL, options, archive, queue, last 500 logs) is
  debounce-written to `localStorage['sitemap-builder:crawl:v1']`
- On load, an unfinished task shows a banner: continue or discard & reset
- Records are capped at 5000 / queue 5000 / logs 500; exceeding the localStorage
  quota degrades to "no persistence" with an inline warning (the crawl itself is
  unaffected)

---

## Testing

```bash
npm run test      # Vitest: unit + reducer + component + API tests (no browser)
npm run e2e       # Playwright: real Chromium (builds first)
```

| Layer | File(s) | Coverage |
| --- | --- | --- |
| Toolchain smoke | `tests/toolchain.test.tsx` | Vitest + jsdom + `@/` alias + RTL wiring |
| Unit | `tests/unit/url-utils.test.ts` | Parsing, normalization, scoping, tracking params |
| Unit | `tests/unit/ssrf.test.ts` | Private hosts, IPv4/IPv6, env override |
| Unit | `tests/unit/sitemap.test.ts` | priority / changefreq / lastmod / XML build / index / split |
| Unit | `tests/unit/stats.test.ts` | Derived counters, throughput, formatting |
| Unit | `tests/unit/export.test.ts` | CSV (BOM, quoting), JSON, log text |
| Unit | `tests/unit/zip.test.ts` | ZIP structure verified by inflating with `inflateRawSync` |
| Unit | `tests/unit/persistence.test.ts` | Snapshot round-trip, caps, corruption |
| State machine | `tests/unit/crawl-reducer.test.ts` | Full lifecycle, 404→failed, auto-pause, stop settling |
| Engine | `tests/unit/crawl-engine.test.ts` | BFS order, dedup, slash alias, page budget, pause flag (fake HTTP + clock) |
| API | `tests/api/crawl-route.test.ts` | zod 400s, SSRF 400, 200/206/502 mapping (mocked browser) |
| Components | `tests/components/*.test.tsx` | ControlPanel, UrlList, LogPanel, ExportBar, ViewTabs |
| E2E | `tests/e2e/crawl.spec.ts` | Real crawl, lastmod branches, pause/resume/stop |

Two things worth knowing about the test setup:

- **E2E uses the production server** (`next build` + `next start -p 3100`), not
  `next dev`: Next 16's lockfile allows only one dev instance per project, which
  would clash with your own dev server. The fixture site runs on :4321 with
  `Last-Modified` headers; the Next server gets `ALLOW_PRIVATE_TARGETS=1` because
  the fixture lives on localhost.
- **Radix Select cannot be opened in jsdom** (no pointer capture), so select-based
  interactions are asserted to exist in component tests and exercised in E2E.

---

## Troubleshooting

### `Can't resolve 'shadcn/tailwind.css'` (dev server cannot compile)

`app/globals.css` imports `shadcn/tailwind.css`, which is shipped by the **shadcn CLI
package (4.x)**. The `shadcn@1.0.0` published on npm is an empty placeholder — if it
ends up installed (a hand-edited version range does it), the CSS import stops
resolving and Turbopack fails on `/app/globals.css`.

```bash
npm install -D shadcn@latest   # must resolve to 4.x
npm ls shadcn                  # expect shadcn@4.21.x
```

`package-lock.json` pins the correct version; avoid editing that dependency by hand.

### `Uncaught SyntaxError: Invalid or unexpected token` in a `react-dom_development` chunk

Two visible symptoms, one cause:

- the console reports a syntax error inside a `react-dom_development*.js` chunk;
- because React never hydrates, submitting the form with 开始抓取 falls back to a
  **native GET**, so the URL becomes `http://localhost:3000/?`.

This is **not** caused by this app or by a stale `.next` cache. The Wallaby.js
**Console Ninja** VS Code extension hooks into `next dev` and, in its *preview*
Turbopack integration, can serve **truncated chunks** (the file simply ends
mid-string).

Fix any one of:

- update the Console Ninja extension, or disable it for this workspace;
- run the dev server outside the VS Code terminal (no build hook gets injected);
- wipe a half-written cache: `Remove-Item -Recurse -Force .next` (bash:
  `rm -rf .next`).

Quick check that a served chunk is intact:

```bash
curl -s http://localhost:3000/_next/static/chunks/<chunk>.js -o chunk.js
node --check chunk.js   # exit 0 = valid
```

---

## Known Limitations

- `robots.txt` of the target site is not read
- Existing `sitemap.xml` / sitemap index files are not parsed or imported
- `lastmod` reflects the `Last-Modified` header or the crawl time — it cannot know
  the content's real edit history; `priority` is a depth-based heuristic, not a
  human weight
- The start URL's own path is the crawl scope: `https://x.com/blog/post-1` crawls
  only that subtree; to cover `/blog`, enter the directory URL
- Authenticated pages (cookies / Basic Auth / logins) are not supported
- Resume-after-refresh is bounded by the localStorage quota; split very large tasks
- TypeScript is pinned to **5.9**: the native `typescript@7` compiler is not yet
  supported by typescript-eslint and breaks `npm run lint`