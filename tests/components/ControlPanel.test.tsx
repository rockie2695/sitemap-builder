/**
 * Component tests for `ControlPanel`.
 *
 * `ControlPanel` 的元件測試。
 */
import { describe, expect, it, vi } from 'vitest'
import { fireEvent } from '@testing-library/react'

import { ControlPanel } from '@/components/dashboard/ControlPanel'
import { DEFAULT_OPTIONS } from '@/hooks/crawler/constants'
import { renderWithI18n, screen, userEvent } from '../helpers/render'
import type { CrawlOptions } from '@/types/crawl'

/** Props preset. */
function props(overrides: Partial<Parameters<typeof ControlPanel>[0]> = {}) {
  return {
    inputUrl: '',
    onInputUrlChange: vi.fn(),
    onStart: vi.fn(),
    onPause: vi.fn(),
    onResume: vi.fn(),
    onStop: vi.fn(),
    onReset: vi.fn(),
    phase: 'idle' as const,
    options: { ...DEFAULT_OPTIONS } as CrawlOptions,
    onOptionsChange: vi.fn(),
    ...overrides,
  }
}

describe('ControlPanel', () => {
  it('renders the URL field and all buttons / 渲染網址欄與所有按鈕', () => {
    renderWithI18n(<ControlPanel {...props()} />)
    expect(screen.getByLabelText('Start URL')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Start/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Stop/ })).toBeInTheDocument()
  })

  it('enables start while idle but keeps stop disabled / 閒置時開始可用、停止停用', () => {
    renderWithI18n(<ControlPanel {...props({ phase: 'idle' })} />)
    expect(screen.getByRole('button', { name: /Start/ })).toBeEnabled()
    expect(screen.getByRole('button', { name: /Stop/ })).toBeDisabled()
  })

  it('disables start while running and shows pause / 執行中停用開始並顯示暫停', () => {
    renderWithI18n(<ControlPanel {...props({ phase: 'running' })} />)
    expect(screen.getByRole('button', { name: /Start/ })).toBeDisabled()
    expect(screen.getByRole('button', { name: /Pause/ })).toBeEnabled()
    expect(screen.getByRole('button', { name: /Stop/ })).toBeEnabled()
  })

  it('disables continue while not paused / 非暫停時停用繼續', () => {
    renderWithI18n(<ControlPanel {...props({ phase: 'done' })} />)
    expect(screen.getByRole('button', { name: /Resume/ })).toBeDisabled()
  })

  it('enables continue while paused / 暫停時啟用繼續', () => {
    renderWithI18n(<ControlPanel {...props({ phase: 'paused' })} />)
    expect(screen.getByRole('button', { name: /Resume/ })).toBeEnabled()
  })

  it('submits the form on Enter / Enter 送出表單', async () => {
    const user = userEvent.setup()
    const onStart = vi.fn()
    renderWithI18n(<ControlPanel {...props({ onStart })} />)
    await user.type(screen.getByLabelText('Start URL'), '{Enter}')
    expect(onStart).toHaveBeenCalledTimes(1)
  })

  it('does not restart when clicking stop (type=button) / 點擊停止不會重新送出', async () => {
    const user = userEvent.setup()
    const onStart = vi.fn()
    const onStop = vi.fn()
    renderWithI18n(<ControlPanel {...props({ phase: 'running', onStart, onStop })} />)
    await user.click(screen.getByRole('button', { name: /Stop/ }))
    expect(onStop).toHaveBeenCalledTimes(1)
    expect(onStart).not.toHaveBeenCalled() // the form-submit regression guard
  })

  it('fires the pause callback / 觸發暫停回呼', async () => {
    const user = userEvent.setup()
    const onPause = vi.fn()
    renderWithI18n(<ControlPanel {...props({ phase: 'running', onPause })} />)
    await user.click(screen.getByRole('button', { name: /Pause/ }))
    expect(onPause).toHaveBeenCalledTimes(1)
  })

  it('toggles the query switch into the options / 查詢參數開關寫入選項', async () => {
    const user = userEvent.setup()
    const onOptionsChange = vi.fn()
    renderWithI18n(<ControlPanel {...props({ onOptionsChange })} />)
    await user.click(screen.getAllByRole('switch')[0])
    expect(onOptionsChange).toHaveBeenCalledWith({ stripQuery: false })
  })

  it('edits maxPages through the number input / 透過數字欄編輯最大頁數', () => {
    const onOptionsChange = vi.fn()
    renderWithI18n(<ControlPanel {...props({ onOptionsChange })} />)
    fireEvent.change(screen.getByLabelText(/Max pages/), { target: { value: '50' } })
    expect(onOptionsChange).toHaveBeenLastCalledWith(expect.objectContaining({ maxPages: 50 }))
  })

  it('clamps maxPages to at least 1 / 最大頁數最小為 1', async () => {
    const user = userEvent.setup()
    const onOptionsChange = vi.fn()
    renderWithI18n(<ControlPanel {...props({ onOptionsChange })} />)
    await user.clear(screen.getByLabelText(/Max pages/))
    expect(onOptionsChange).toHaveBeenLastCalledWith(expect.objectContaining({ maxPages: 1 }))
  })

  it('exposes the concurrency and retry inputs / 提供並發與重試輸入框', () => {
    const { container } = renderWithI18n(<ControlPanel {...props()} />)
    const concurrency = container.querySelector('input[name="concurrency"]') as HTMLInputElement
    const retries = container.querySelector('input[name="retryCount"]') as HTMLInputElement
    expect(concurrency).not.toBeNull()
    expect(retries).not.toBeNull()
    expect(concurrency.value).toBe('1')
    expect(retries.value).toBe('0')
  })

  it('clamps concurrency into 1–5 / 並發數夾在 1～5', () => {
    const onOptionsChange = vi.fn()
    const { container } = renderWithI18n(<ControlPanel {...props({ onOptionsChange })} />)
    fireEvent.change(container.querySelector('input[name="concurrency"]') as HTMLInputElement, {
      target: { value: '99' },
    })
    expect(onOptionsChange).toHaveBeenLastCalledWith(expect.objectContaining({ concurrency: 5 }))
  })

  it('clamps retries into 0–5 / 重試次數夾在 0～5', () => {
    const onOptionsChange = vi.fn()
    const { container } = renderWithI18n(<ControlPanel {...props({ onOptionsChange })} />)
    fireEvent.change(container.querySelector('input[name="retryCount"]') as HTMLInputElement, {
      target: { value: '9' },
    })
    expect(onOptionsChange).toHaveBeenLastCalledWith(expect.objectContaining({ retryCount: 5 }))
  })
})