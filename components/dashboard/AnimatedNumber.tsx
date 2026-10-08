/**
 * Animated number display for the stat cards.
 *
 * Uses Motion's `animate()` helper with `LazyMotion`, so we ship only the tiny
 * `m` component + animation runtime instead of the full `motion` bundle.
 *
 * 統計卡片的數字動畫。使用 Motion 的 `animate()` 搭配 `LazyMotion`，
 * 只載入輕量的 `m` 元件與動畫執行階段，而非完整的 motion bundle。
 */
'use client'

import { useEffect, useRef } from 'react'
import { animate, useMotionValue } from 'motion/react'

interface AnimatedNumberProps {
  /** Value to display; decimals are preserved. */
  value: number
  /** Rendered verbatim when the value is not a finite number. */
  fallback?: string
  /** Extra class on the number, e.g. for tabular numerals. */
  className?: string
}

/**
 * Count up to `value` instead of snapping to it.
 *
 * @param value Target number; changes animate from the previous value.
 */
export function AnimatedNumber({ value, fallback = '—', className }: AnimatedNumberProps) {
  const motionValue = useMotionValue(value)
  /** Text node we update on every animation frame. */
  const ref = useRef<HTMLSpanElement>(null)
  /** Remember the last rendered value so we can round consistently. */
  const hasFractionRef = useRef(false)

  useEffect(() => {
    if (!Number.isFinite(value)) return

    // Track whether we need decimals across frames: 0.8 → "0.8", 12 → "12".
    const needsFraction = !Number.isInteger(value)
    hasFractionRef.current = hasFractionRef.current || needsFraction

    const controls = animate(motionValue, value, {
      duration: 0.45,
      ease: 'easeOut',
      onUpdate: (latest) => {
        if (!ref.current) return
        const text = hasFractionRef.current ? latest.toFixed(1) : String(Math.round(latest))
        ref.current.textContent = text
      },
    })

    return () => controls.stop()
  }, [motionValue, value])

  if (!Number.isFinite(value)) return <span className={className}>{fallback}</span>

  return (
    <span ref={ref} className={className}>
      {Number.isInteger(value) ? value : value.toFixed(1)}
    </span>
  )
}