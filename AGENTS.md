<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

---

# Project Guide for AI Agents / AI 代理的專案指南

*(This section is maintained by the project, outside the auto-generated block above. / 本區段由專案維護，位於上方自動產生的區塊之外。)*

## What this app is / 應用程式簡介

A sitemap generator: the server renders pages headlessly (Playwright) and extracts
links; the client drives the queue, dedup and exports. Docs: [README.md](./README.md)
(English) and [README.zh-TW.md](./README.zh-TW.md) (Traditional Chinese).

sitemap 產生器：伺服器以 Playwright 無頭渲染頁面並擷取連結；前端驅動佇列、去重與匯出。

## Commands / 指令

```bash
npm run verify      # typecheck + lint + vitest — run before finishing any task
npm run test        # vitest run (unit + component + API)
npm run e2e         # playwright test — needs `npm run build` first; uses :3100 (prod) + :4321 (fixture)
npm run build       # production build
npm run dev         # dev server; only ONE dev instance per project is allowed (lockfile)
```

## Architecture map / 架構地圖

| Path | Role |
| --- | --- |
| `hooks/crawler/reducer.ts` | Pure state machine (`crawlReducer`) — no refs, no timers, no network |
| `hooks/crawler/engine.ts` | Crawl loop; OWNS the FIFO `queue` and the `seen` dedup set |
| `hooks/crawler/request.ts` | `/api/crawl` HTTP layer; partial-success rules |
| `hooks/crawler/usePersistence.ts` | Snapshot save/restore effects |
| `hooks/crawler/index.ts` | `useCrawler()` composition; the only import the UI needs |
| `lib/crawler/crawlPage.ts` | Server-side page fetch; injectable browser for tests |
| `lib/crawler/schema.ts` | zod schemas — single source of truth for the wire format |
| `lib/sitemap/*` | Entry building, priority/URL strategies, XML serialisation, splitting |
| `lib/crawler/seoDocument.ts` | Per-page SEO extraction (self-contained for `page.evaluate`) |
| `lib/seo/*` | SEO scoring, site-wide report and i18n key mapping (pure) |
| `lib/serp/*` | SERP extraction/providers, rank lookup, query derivation, competitor analysis (opt-in) |
| `hooks/serp/*` | `useSerp()`: spaced, resumable ranking queue + its own persistence key |
| `lib/export/*` | CSV/JSON/log/ZIP + browser downloads |
| `lib/i18n/*` | Three-locale dictionaries (type-checked) + runtime |
| `components/providers/LocaleProvider.tsx` | Locale state `useI18n()` — wrap anything using UI copy |
| `components/dashboard/*` | All UI; `SitemapBuilder.tsx` is the shell |

## Invariants — do not break these / 不變量——請勿破壞

1. **The queue lives in the engine, not in the reducer.** Discovery happens in the
   loop (`registerUrl`) BEFORE the `page/result` dispatch; the reducer only builds
   the view model. 佇列屬於引擎：發現（`registerUrl`）在 dispatch 之前完成。
2. **`crawlReducer` must stay pure.** No `Date.now()`, no refs, no side effects, and
   **no formatted user-facing text** — logs are emitted as `{ key, params }` i18n
   keys. Keep it unit-testable.
   狀態機必須保持純函式，且不得輸出已格式化的文字：日誌一律以 i18n 鍵＋參數輸出。
3. **A reachable 4xx/5xx page is `failed`, not `done`** — it must never enter the
   sitemap, but its links are still collected. 可達的 4xx/5xx 記為失敗，但連結仍要收集。
4. **The start URL is opened as typed** (trailing slash preserved) and its
   slash-stripped form is registered as seen. 起始網址原樣訪問，去斜線形式登記為已見。
5. **SSRF guard is on by default** (`ALLOW_PRIVATE_TARGETS=1` opts out). Local
   crawling and the E2E fixture require the override. SSRF 預設開啟。
6. **Virtual scrolling is ref-free by design.** eslint-config-next's
   `react-hooks/refs` flags any value returned from a hook that touches a ref —
   never return refs from hooks, and never read `.current` during render.
   虛擬滾動刻意不用 ref，也不要在渲染期讀取 `.current`。
7. **Every non-submit button inside a form needs `type="button"`**, otherwise it
   submits and silently restarts the task. 表單內的非送出按鈕必須宣告 `type="button"`。
8. **Imports go at the top of the file.** 呼叫一律置於檔案頂部。
9. **The `shadcn` devDependency must stay on 4.x.** `app/globals.css` imports
   `shadcn/tailwind.css`, which only the modern CLI package ships; `shadcn@1.0.0` on
   npm is an empty placeholder and breaks the dev compile.
   `shadcn` 必須維持 4.x，否則 `shadcn/tailwind.css` 無法解析。
10. **New crawl options go into `DEFAULT_OPTIONS`** (`hooks/crawler/constants.ts`).
    Restored snapshots merge over those defaults, so a missing default surfaces as a
    controlled-input warning. 新選項必須加入 `DEFAULT_OPTIONS`。
11. **All export paths share one resolver per concern**: priority via
    `resolvePriority`, URLs via `displayUrl`, changefreq via `resolveChangefreq`.
    Never compute these inline in a component or a single exporter.
    匯出各項計算必須共用同一個解析函式，禁止在元件或單一匯出器內各自實作。
12. **UI copy comes from `useI18n()`** and every new key must be added to all three
    dictionaries (`lib/i18n/{en,zh-TW,zh-CN}.ts`) — the `Record<UiKey, string>` type
    makes a missing translation a compile error. 所有文案走 `useI18n()`，新鍵必須三語齊備。
13. **`collectSeoFromDocument` must stay self-contained.** Playwright serializes it for
    `page.evaluate`, so it may not reference module scope; add helpers *inside* it, and
    keep the optional `doc = document` parameter so tests can pass a jsdom document.
    該函式必須自足（會被序列化到頁面內），輔助函式要寫在裡面。
14. **SEO scoring and reporting stay pure and memoised off the records array** — they
    must not run on the 1-second sampler tick (`useMemo` on `records`).
    SEO 評分／報告必須是純函式，且以 records 身分做記憶化。
15. **`UrlRecord.seo` is optional** (failed pages and older snapshots lack it) and the
    resume snapshot is **size-aware**: past ~3 MB the SEO payload is dropped and a warning
    is logged. SEO 資料為選填，且快照超過體積上限時會丟棄它並記錄警告。
16. **`collectSerpResults` / `detectSerpBlock` must stay self-contained**, exactly like
    `collectSeoFromDocument`: Playwright serializes them for `page.evaluate`, so no module
    scope, and the optional `doc = document` parameter must remain for jsdom tests.
    SERP 擷取函式必須自足，且保留選填的 `doc` 參數供測試使用。
17. **SERP is opt-in and rate-limited**: one query at a time with a hard
    `SERP_MIN_INTERVAL_MS` floor, fatal blocks auto-pause the run, and the paid provider
    key (`SERPAPI_KEY`) is read **server-side only** — never ship it to the client.
    SERP 為選用且限速；致命封鎖會自動暫停；付費 key 只在伺服器端讀取。
18. **SERP records live under their own localStorage key**, separate from the crawl
    snapshot, and competitor analysis reuses `collectSeoFromDocument` so the comparison
    stays apples-to-apples. SERP 結果自己一個儲存鍵；競品分析共用 SEO 採集器。

## Option behaviour notes / 選項行為備註

- **Retries** (`retryCount`) only apply to *transport* failures, do not consume
  `maxPages`, reuse `delayMs`, and do not reset the consecutive-error auto-pause
  counter. 重試只針對傳輸失敗，不佔頁數上限，也不重置自動暫停計數。
- **Concurrency** (`concurrency`) keeps a global start pace of one request per
  `delayMs`, at most N in flight; the queue check precedes the page-budget check so a
  site with exactly `maxPages` pages reports "finished", not "limit reached".
  並發仍維持每 `delayMs` 啟動一個請求的全域節奏；先檢查佇列是否為空，再檢查頁數上限。
- **Redirects**: `goto` follows them, `finalUrl` is stored, and the in-scope final
  URL is registered as seen so it is not crawled twice. `useFinalUrl` switches the
  export to the final address. The reducer also sets `record.redirected` (via
  `isRedirected`), which drives the `↪` marker and the **Exclude redirected** switch.
  重定向會被跟隨，最終位址會登記為已見；`useFinalUrl` 控制匯出使用最終位址，
  reducer 另會設定 `record.redirected`（透過 `isRedirected`）。
- **No cross-domain crawling**: the scope is always the start URL's `origin` plus
  `pathPrefix`. 不做跨域抓取。

## Known environment pitfalls / 已知環境陷阱

- **Console Ninja (Wallaby.js VS Code extension)** hooks `next dev` and, in its
  *preview* Turbopack integration, can serve truncated chunks → `Uncaught
  SyntaxError: Invalid or unexpected token` in a `react-dom_development` chunk, and
  form submissions falling back to a native GET (`/?`). Not an app bug and not a
  `.next` cache issue. Diagnose with `node --check <chunk>.js`.
  Console Ninja 的 preview Turbopack 整合會截斷 chunk，導致語法錯誤與表單原生提交。
- The dev server has a per-project lockfile: only **one** `next dev` per project.
  E2E therefore uses the production server on :3100. dev 每個專案只允許一個實例。

## Conventions / 慣例

- Comments and docs are **bilingual**: English first, then Traditional Chinese.
  註釋與文件為雙語：先英文，後繁體中文。
- All UI copy is Simplified Chinese. 介面文案為簡體中文。
- `npm run verify` must pass before finishing any change; run `npm run e2e` after
  touching `lib/`, `hooks/` or any component. 完成任何變更前必須通過 verify。
- E2E tests run against the PRODUCTION build — rebuild after code changes, or the
  suite tests stale code. E2E 針對生產建置，改碼後必須重新 build。