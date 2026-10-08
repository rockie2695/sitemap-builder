/**
 * Lightweight virtual scrolling: only the rows near the viewport are rendered, so
 * tens of thousands of URLs or log lines stay smooth without any dependency.
 *
 * Deliberately no `useRef` inside this hook: eslint-config-next's react-hooks/refs
 * flags ANY value returned from a hook that touches refs, and reading a field of
 * that object during render then errors. The scroll container is owned by the
 * component; this hook only sees the scroll event and maintains the window.
 *
 * 輕量虛擬滾動：只渲染視口附近的列，數萬筆 URL 或日誌依然流暢，且不引入相依套件。
 * 這個 hook 刻意不使用 useRef：eslint-config-next 的 react-hooks/refs 會把
 * 「內部碰過 ref 的 hook 所回傳的值」整體判為 ref，渲染期讀取其欄位就會報錯。
 * 滾動容器由元件自己持有，這裡只透過事件取得節點並維護渲染視窗。
 */
import { useCallback, useState } from 'react'
import type { UIEvent } from 'react'

import { computeWindow } from '@/lib/virtual'

/** Options for {@link useVirtualWindow}. */
interface VirtualWindowOptions {
  /** Total item count. */
  count: number
  /** Fixed row height in pixels. */
  rowHeight: number
  /** Extra rows rendered above and below the viewport. */
  overscan?: number
}

/** Everything the list components need. */
export interface VirtualWindowResult {
  /** Attach to the scroll container's `onScroll`. */
  onScroll: (event: UIEvent<HTMLDivElement>) => void
  /** First rendered index. */
  startIndex: number
  /** One past the last rendered index. */
  endIndex: number
  /** Spacer height above the window. */
  paddingTop: number
  /** Spacer height below the window. */
  paddingBottom: number
  /** Full list height, used as the scroll area's content height. */
  totalHeight: number
}

/**
 * Virtual window over a fixed-row-height list.
 *
 * The window state starts at `{ start: 0, end: 40 }` (enough to fill a typical
 * container) and is only updated from the scroll event when the window actually
 * changes — most events bail out early.
 */
export function useVirtualWindow({
  count,
  rowHeight,
  overscan = 8,
}: VirtualWindowOptions): VirtualWindowResult {
  const [window, setWindow] = useState({ start: 0, end: 40 })

  const onScroll = useCallback(
    (event: UIEvent<HTMLDivElement>) => {
      const node = event.currentTarget
      const next = computeWindow({
        count,
        rowHeight,
        overscan,
        scrollTop: node.scrollTop,
        viewportHeight: node.clientHeight,
      })

      // Return the same object when nothing changed so React skips the re-render.
      setWindow((previous) =>
        previous.start === next.start && previous.end === next.end ? previous : next,
      )
    },
    [count, rowHeight, overscan],
  )

  // Clamp during render (no setState): the archive grows while crawling, and the
  // tail must not show a blank gap.
  const startIndex = count === 0 ? 0 : Math.min(window.start, Math.max(0, count - 1))
  const endIndex = count === 0 ? 0 : Math.min(count, Math.max(startIndex + 1, window.end))

  return {
    onScroll,
    startIndex,
    endIndex,
    paddingTop: startIndex * rowHeight,
    paddingBottom: Math.max(0, (count - endIndex) * rowHeight),
    totalHeight: count * rowHeight,
  }
}