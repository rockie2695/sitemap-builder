/**
 * View mode switch for the lower half of the dashboard.
 *
 * Wide screens default to the split dashboard (URL table beside the log), but on
 * phones the two panels become unusable, so users can focus on one at a time. The
 * choice is remembered across reloads.
 *
 * 儀表板下半部的檢視模式切換。寬螢幕預設使用分欄，但在手機上兩個面板都難以閱讀，
 * 因此可一次專注其一。選擇會被記住。
 */
'use client'

import { Columns2, ListTree, ScrollText } from 'lucide-react'

import { useI18n } from '@/components/providers/LocaleProvider'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import type { UiKey } from '@/lib/i18n'

/** Available layouts for the URL table + log panel. */
export type ViewMode = 'split' | 'list' | 'logs'

/** Label plus tooltip key per mode. */
const VIEW_ITEMS: Array<{
  value: ViewMode
  label: UiKey
  hint: UiKey
  icon: typeof Columns2
}> = [
  { value: 'split', label: 'view.split', hint: 'view.splitHint', icon: Columns2 },
  { value: 'list', label: 'view.list', hint: 'view.listHint', icon: ListTree },
  { value: 'logs', label: 'view.logs', hint: 'view.logsHint', icon: ScrollText },
]

interface ViewTabsProps {
  /** Currently active mode. */
  value: ViewMode
  /** Fired with the newly selected mode. */
  onChange: (mode: ViewMode) => void
}

/** Segmented control that switches between split / list / logs. */
export function ViewTabs({ value, onChange }: ViewTabsProps) {
  const { t } = useI18n()

  return (
    <div className="flex items-center gap-2">
      <span className="hidden text-xs text-muted-foreground sm:inline">{t('view.label')}</span>
      <ToggleGroup
        type="single"
        value={value}
        onValueChange={(next) => {
          // Radix reports an empty string when the active item is clicked again.
          if (next) onChange(next as ViewMode)
        }}
        variant="outline"
        size="sm"
        aria-label={t('view.label')}
      >
        {VIEW_ITEMS.map((item) => (
          <ToggleGroupItem key={item.value} value={item.value} title={t(item.hint)}>
            <item.icon className="size-3.5" />
            <span className="hidden sm:inline">{t(item.label)}</span>
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
    </div>
  )
}