/**
 * Test helpers for the SERP workspace.
 *
 * SERP 工作區的測試輔助。
 */
import type { UseSerpResult } from '@/hooks/serp'
import { DEFAULT_SERP_OPTIONS } from '@/hooks/serp/constants'

/**
 * Build a `useSerp()` result with inert behaviour, for components that only need to
 * render (e.g. the SEO tab) without exercising ranking logic.
 *
 * @param overrides Fields to replace.
 */
export function createSerpStub(overrides: Partial<UseSerpResult> = {}): UseSerpResult {
  const noop = () => undefined
  return {
    status: 'idle',
    results: {},
    queries: [],
    completed: 0,
    current: null,
    failures: [],
    fatal: null,
    options: DEFAULT_SERP_OPTIONS,
    setOptions: noop,
    start: noop,
    pause: noop,
    resume: noop,
    stop: noop,
    clear: noop,
    ...overrides,
  }
}