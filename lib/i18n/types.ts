/**
 * i18n key and locale types.
 *
 * The app ships three locales with a zero-dependency dictionary. Dictionaries are
 * typed as `Record<UiKey, string>`, so a missing translation is a **compile error**
 * rather than a runtime fallback.
 *
 * 三語字典的型別定義。字典以 `Record<UiKey, string>` 標註，
 * 缺少翻譯會在編譯期報錯，而不是執行期才發現。
 */

/** Supported UI locales. */
export type Locale = 'en' | 'zh-TW' | 'zh-CN'

/** Every locale, in the order shown by the language switcher. */
export const LOCALES: readonly Locale[] = ['en', 'zh-TW', 'zh-CN']

/** BCP-47 tag written into `<html lang>` per locale. */
export const HTML_LANG: Record<Locale, string> = {
  en: 'en',
  'zh-TW': 'zh-Hant',
  'zh-CN': 'zh-Hans',
}

/** Native name of each locale, used by the switcher. */
export const LOCALE_LABEL: Record<Locale, string> = {
  en: 'English',
  'zh-TW': '繁體中文',
  'zh-CN': '简体中文',
}

/** Values interpolated into a message via `{name}` placeholders. */
export type MessageParams = Record<string, string | number>

/**
 * Keys for engine-produced log lines.
 *
 * The crawl reducer is a pure function and never sees the locale, so it emits a
 * key plus its parameters; the log panel and the log export translate them.
 *
 * 引擎日誌的鍵。reducer 是純函式、無從得知語系，因此它只輸出鍵與參數，
 * 由日誌面板與日誌匯出負責翻譯。
 */
export type LogMessageKey =
  | 'log.task.start'
  | 'log.task.scope.stripped'
  | 'log.task.scope.kept'
  | 'log.page.start'
  | 'log.page.ok'
  | 'log.page.okWarn'
  | 'log.page.httpError'
  | 'log.page.fail'
  | 'log.page.autoPaused'
  | 'log.page.retry'
  | 'log.task.stopped'
  | 'log.task.limitReached'
  | 'log.task.finish'
  /** Verbatim text carried over from a pre-i18n snapshot. */
  | 'log.legacy'

/** Keys for every static UI string. */
export type UiKey =
  // App chrome
  | 'app.subtitle'
  | 'header.theme.toLight'
  | 'header.theme.toDark'
  | 'header.language'
  // Phases
  | 'phase.idle'
  | 'phase.running'
  | 'phase.paused'
  | 'phase.stopped'
  | 'phase.done'
  // Control panel
  | 'control.startUrl'
  | 'control.start'
  | 'control.pause'
  | 'control.resume'
  | 'control.stop'
  | 'control.clear'
  | 'control.clearTitle'
  | 'control.keepQuery'
  | 'control.query.stripped'
  | 'control.query.kept'
  | 'control.maxPages'
  | 'control.delay'
  | 'control.delayUnit'
  | 'control.concurrency'
  | 'control.concurrencyTitle'
  | 'control.retryCount'
  | 'control.retryTitle'
  | 'control.times'
  // Alerts
  | 'alert.cannotStart'
  | 'alert.persistFailed'
  | 'alert.restored.title'
  | 'alert.restored.body'
  | 'alert.resume'
  | 'alert.discard'
  | 'alert.hint.title'
  | 'alert.hint.p1'
  | 'alert.hint.p2'
  // Stats
  | 'stats.addedToSitemap'
  | 'stats.pending'
  | 'stats.crawling'
  | 'stats.done'
  | 'stats.failed'
  | 'stats.skipped'
  | 'stats.successRate'
  | 'stats.perMinute'
  | 'stats.elapsed'
  | 'stats.avgPerPage'
  | 'stats.perMinuteUnit'
  | 'stats.hint.addedToSitemap'
  | 'stats.hint.pending'
  | 'stats.hint.crawling'
  | 'stats.hint.done'
  | 'stats.hint.failed'
  | 'stats.hint.skipped'
  | 'stats.hint.successRate'
  | 'stats.hint.perMinute'
  | 'stats.hint.elapsed'
  | 'stats.hint.avgPerPage'
  // Current job
  | 'job.title'
  | 'job.waitingInput'
  | 'job.idle'
  | 'job.stage.queue'
  | 'job.stage.request'
  | 'job.stage.extract'
  | 'job.stage.done'
  | 'job.progress'
  | 'job.processed'
  | 'job.eta'
  | 'job.concurrency'
  | 'legend.done'
  | 'legend.failed'
  | 'legend.crawling'
  | 'legend.pending'
  // Charts
  | 'charts.title'
  | 'charts.collapse'
  | 'charts.expand'
  | 'charts.empty'
  | 'charts.series.done'
  | 'charts.series.pending'
  | 'charts.period.current'
  | 'charts.period.full'
  | 'charts.period.hint'
  // View switch
  | 'view.label'
  | 'view.split'
  | 'view.list'
  | 'view.logs'
  | 'view.splitHint'
  | 'view.listHint'
  | 'view.logsHint'
  // URL list
  | 'urls.title'
  | 'urls.searchPlaceholder'
  | 'urls.status.all'
  | 'urls.empty'
  | 'urls.emptyHint'
  | 'urls.noMatch'
  | 'urls.copy'
  | 'urls.copied'
  | 'urls.open'
  | 'urls.clearFilters'
  | 'urls.col.status'
  | 'urls.col.url'
  | 'urls.col.title'
  | 'urls.col.httpStatus'
  | 'urls.col.depth'
  | 'urls.col.foundLinks'
  | 'urls.col.duration'
  | 'urls.col.actions'
  // Status labels
  | 'status.queued'
  | 'status.crawling'
  | 'status.done'
  | 'status.failed'
  // Logs
  | 'logs.title'
  | 'logs.searchPlaceholder'
  | 'logs.level.all'
  | 'logs.autoScroll'
  | 'logs.export'
  | 'logs.clear'
  | 'logs.empty'
  // Export
  | 'export.sitemapXml'
  | 'export.csv'
  | 'export.json'
  | 'export.count'
  | 'export.optionsTitle'
  | 'export.excludeFailed'
  | 'export.lastmod'
  | 'export.lastmodHint'
  | 'export.priority'
  | 'export.priorityHint'
  | 'export.priorityStrategy.linkDepth'
  | 'export.priorityStrategy.pathDepth'
  | 'export.priorityStrategy.relativePathDepth'
  | 'export.changefreq'
  | 'export.split'
  | 'export.splitHint'
  | 'export.perFile'
  | 'export.perFileUnit'
  | 'export.readableUrls'
  | 'export.readableUrlsHint'
  | 'export.useFinalUrl'
  | 'export.useFinalUrlHint'
  | 'export.hostOverride'
  | 'export.hostOverridePlaceholder'
  | 'export.hostOverrideHint'
  | 'export.failedWarning'
  | 'export.done.xml'
  | 'export.done.csv'
  | 'export.done.json'
  | 'export.done.splitZip'
  | 'export.done.splitSequential'
  | 'export.done.noSplit'
  | 'export.done.overLimit'
  | 'export.failed'
  // Changefreq option labels (protocol values stay literal)
  | 'changefreq.auto'
  // Client-side error messages
  | 'error.invalidUrl'
  | 'error.ssrf'
  | 'error.invalidBody'
  | 'error.unparseableJson'
  | 'error.unparseableResponse'
  | 'error.httpStatus'

/** A complete dictionary for one locale. */
export type Dictionary = Record<UiKey, string>

/** A complete log-message dictionary for one locale. */
export type LogDictionary = Record<LogMessageKey, string>