/**
 * Component tests for `ControlPanel`.
 *
 * `ControlPanel` 的元件測試。
 */
import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'

import { ControlPanel } from '@/components/dashboard/ControlPanel'
import { DEFAULT_OPTIONS } from '@/hooks/crawler/constants'
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
    render(<ControlPanel {...props()} />)
    expect(screen.getByLabelText('起始 URL')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /开始抓取/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /停止/ })).toBeInTheDocument()
  })

  it('enables start while idle but keeps stop disabled / 閒置時開始可用、停止停用', () => {
    render(<ControlPanel {...props({ phase: 'idle' })} />)
    // Starting from idle is the normal entry point, so start must be enabled.
    expect(screen.getByRole('button', { name: /开始抓取/ })).toBeEnabled()
    expect(screen.getByRole('button', { name: /停止/ })).toBeDisabled()
  })

  it('disables start while running and shows pause / 執行中停用開始並顯示暫停', () => {
    render(<ControlPanel {...props({ phase: 'running' })} />)
    expect(screen.getByRole('button', { name: /开始抓取/ })).toBeDisabled()
    expect(screen.getByRole('button', { name: /暂停/ })).toBeEnabled()
    expect(screen.getByRole('button', { name: /停止/ })).toBeEnabled()
  })

  it('disables continue while not paused / 非暫停時停用繼續', () => {
    render(<ControlPanel {...props({ phase: 'done' })} />)
    expect(screen.getByRole('button', { name: /继续/ })).toBeDisabled()
  })

  it('enables continue and resume while paused / 暫停時啟用繼續', () => {
    render(<ControlPanel {...props({ phase: 'paused' })} />)
    expect(screen.getByRole('button', { name: /继续/ })).toBeEnabled()
  })

  it('submits the form on Enter / Enter 送出表單', async () => {
    const user = userEvent.setup()
    const onStart = vi.fn()
    render(<ControlPanel {...props({ onStart })} />)
    const input = screen.getByLabelText('起始 URL')
    await user.type(input, '{Enter}')
    expect(onStart).toHaveBeenCalledTimes(1)
  })

  it('does not restart when clicking stop (type=button) / 點擊停止不會重新送出', async () => {
    const user = userEvent.setup()
    const onStart = vi.fn()
    const onStop = vi.fn()
    render(<ControlPanel {...props({ phase: 'running', onStart, onStop })} />)
    await user.click(screen.getByRole('button', { name: /停止/ }))
    expect(onStop).toHaveBeenCalledTimes(1)
    expect(onStart).not.toHaveBeenCalled() // the form submit regression guard
  })

  it('fires the pause callback / 觸發暫停回呼', async () => {
    const user = userEvent.setup()
    const onPause = vi.fn()
    render(<ControlPanel {...props({ phase: 'running', onPause })} />)
    await user.click(screen.getByRole('button', { name: /暂停/ }))
    expect(onPause).toHaveBeenCalledTimes(1)
  })

  it('toggles the query switch into the options / 查詢參數開關寫入選項', async () => {
    const user = userEvent.setup()
    const onOptionsChange = vi.fn()
    render(<ControlPanel {...props({ onOptionsChange })} />)
    await user.click(screen.getByRole('switch'))
    expect(onOptionsChange).toHaveBeenCalledWith({ stripQuery: false })
  })

  it('edits maxPages through the number input / 透過數字欄編輯最大頁數', () => {
    const onOptionsChange = vi.fn()
    render(<ControlPanel {...props({ onOptionsChange })} />)
    // The label wraps the input, so the accessible name works. fireEvent.change
    // sets the value directly; typing would append after the clamp-on-clear.
    fireEvent.change(screen.getByLabelText(/最大页数/), { target: { value: '50' } })
    expect(onOptionsChange).toHaveBeenLastCalledWith(expect.objectContaining({ maxPages: 50 }))
  })

  it('clamps maxPages to at least 1 / 最大頁數最小為 1', async () => {
    const user = userEvent.setup()
    const onOptionsChange = vi.fn()
    render(<ControlPanel {...props({ onOptionsChange })} />)
    // Clearing fires onChange with '' → the handler clamps it to 1.
    await user.clear(screen.getByLabelText(/最大页数/))
    expect(onOptionsChange).toHaveBeenLastCalledWith(expect.objectContaining({ maxPages: 1 }))
  })
})