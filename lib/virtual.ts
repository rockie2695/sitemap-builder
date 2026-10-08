/**
 * DOM utilities for the virtual scrollers.
 *
 * 虛擬滾動用的 DOM 工具。
 */

/**
 * Scroll a container to its bottom.
 *
 * @param node Scroll container; null is tolerated.
 */
export function scrollElementToEnd(node: HTMLElement | null): void {
  if (!node) return
  node.scrollTop = node.scrollHeight
}

/**
 * Whether a container is scrolled to (near) its bottom.
 *
 * @param node      Scroll container.
 * @param threshold Distance from the bottom that still counts as "at the bottom".
 */
export function isElementAtBottom(node: HTMLElement | null, threshold = 24): boolean {
  if (!node) return true
  return node.scrollHeight - node.scrollTop - node.clientHeight < threshold
}

/**
 * Compute the render window from the scroll position.
 *
 * @param options count/rowHeight/overscan plus the container's scroll metrics.
 */
export function computeWindow(options: {
  count: number
  rowHeight: number
  overscan: number
  scrollTop: number
  viewportHeight: number
}): { start: number; end: number } {
  const { count, rowHeight, overscan, scrollTop, viewportHeight } = options
  if (count === 0) return { start: 0, end: 0 }

  const start = Math.max(0, Math.floor(scrollTop / rowHeight) - overscan)
  const visible = Math.ceil(viewportHeight / rowHeight)
  const end = Math.min(count, start + visible + overscan * 2)
  return { start, end }
}