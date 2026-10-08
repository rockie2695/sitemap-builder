/**
 * Vitest configuration (shared by unit / component / API tests).
 *
 * JSX needs no extra plugin here: Vitest 5 transpiles TSX with oxc, which applies
 * the automatic JSX runtime by default (our `tsconfig.json` must keep
 * `"jsx": "preserve"` for Next.js, so we cannot rely on esbuild picking it up).
 *
 * `resolve.tsconfigPaths` makes Vite read the `@/*` alias straight from
 * `tsconfig.json`, so tests and app share exactly one alias definition.
 *
 * 測試設定檔。JSX 不需額外外掛：Vitest 5 以 oxc 轉換 TSX，預設即為 automatic runtime
 * （`tsconfig.json` 必須保留 `"jsx": "preserve"` 給 Next.js，因此不能依賴 esbuild）。
 * `resolve.tsconfigPaths` 直接讀取 `tsconfig.json` 的 `@/*` 別名設定，
 * 讓測試與應用程式共用同一份別名定義。
 */
import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: {
    tsconfigPaths: true,
  },
  test: {
    // Component tests need a DOM; Node-based suites can opt out per file.
    environment: 'jsdom',
    globals: false,
    setupFiles: ['./tests/setup.ts'],
    include: ['tests/**/*.test.{ts,tsx}'],
    exclude: ['tests/e2e/**', 'node_modules/**', '.next/**'],
    restoreMocks: true,
  },
})