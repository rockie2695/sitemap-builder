/**
 * View mode switch for the lower half of the dashboard.
 *
 * Wide screens default to the split dashboard (URL table beside the log), but on
 * phones the two panels become unusable, so users can focus on one at a time. The
 * choice is remembered across reloads.
 *
 * 儀表板下半部的檢視模式切換。寬螢幕預設使用分欄（URL 表格與日誌並排），
 * 但在手機上兩個面板都難以閱讀，因此可一次專注其一。選擇會被記住。
 */
'use client'

import { Columns2, ListTree, ScrollText } from 'lucide-react'

import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'

/** Available layouts for the URL table + log panel. */
export type ViewMode = 'split' | 'list' | 'logs'

/** Label plus tooltip per mode. */
const VIEW_ITEMS: Array<{
  value: ViewMode
  label: string
  hint: string
  icon: typeof Columns2
}> = [
  { value: 'split', label: '分栏', hint: 'URL 列表与实时日志并排显示', icon: Columns2 },
  { value: 'list', label: '列表', hint: '只看已发现的 URL 表格', icon: ListTree },
  { value: 'logs', label: '日志', hint: '只看实时日志', icon: ScrollText },
]

interface ViewTabsProps {
  /** Currently active mode. */
  value: ViewMode
  /** Fired with the newly selected mode. */
  onChange: (mode: ViewMode) => void
}

/** Segmented control that switches between split / list / logs. */
export function ViewTabs({ value, onChange }: ViewTabsProps) {
  return (
    <div className="flex items-center gap-2">
      <span className="hidden text-xs text-muted-foreground sm:inline">检视</span>
      <ToggleGroup
        type="single"
        value={value}
        onValueChange={(next) => {
          // Radix reports an empty string when the active item is clicked again.
          if (next) onChange(next as ViewMode)
        }}
        variant="outline"
        size="sm"
        aria-label="检视模式"
      >
        {VIEW_ITEMS.map((item) => (
          <ToggleGroupItem key={item.value} value={item.value} title={item.hint}>
            <item.icon className="size-3.5" />
            <span className="hidden sm:inline">{item.label}</span>
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
    </div>
  )
}