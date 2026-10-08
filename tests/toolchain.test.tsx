/**
 * Toolchain smoke test: verifies that Vitest, jsdom, the `@/` path alias and
 * React Testing Library are wired up correctly before the real suites land.
 *
 * 工具鏈煙霧測試：在寫正式測試前，先確認 Vitest、jsdom、`@/` 路徑別名與
 * React Testing Library 都能正常運作。
 */
import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'

import { escapeXml } from '@/lib/sitemap'

function Counter({ label }: { label: string }) {
  return <button type="button">{label}</button>
}

describe('test toolchain / 測試工具鏈', () => {
  it('resolves the @/ alias in tests / 測試中可解析 @/ 別名', () => {
    expect(escapeXml('a & b')).toBe('a &amp; b')
  })

  it('renders React components and handles events / 可渲染元件並處理事件', async () => {
    const user = userEvent.setup()
    render(<Counter label="點我" />)
    const button = screen.getByRole('button', { name: '點我' })
    expect(button).toBeInTheDocument()
    await user.click(button)
  })
})