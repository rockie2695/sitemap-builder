/**
 * Global test setup: DOM matchers from `@testing-library/jest-dom` plus automatic
 * cleanup between tests (React Testing Library's `afterEach`).
 *
 * 全域測試初始化：載入 jest-dom 的 DOM 斷言，並在每個測試後自動清理渲染結果。
 */
import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach } from 'vitest'

afterEach(() => {
  cleanup()
})