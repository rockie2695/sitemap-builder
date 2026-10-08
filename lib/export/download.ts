/**
 * Browser-side file download helper.
 *
 * 瀏覽器端檔案下載輔助函式。
 */
import type { DownloadPayload } from './types'
import { createZip } from './zip'

/**
 * Trigger a download for in-memory text content.
 *
 * The object URL is revoked on the next macrotask so Safari/Chrome have time to
 * start reading the blob before it disappears.
 *
 * 以記憶體中的文字內容觸發下載。物件 URL 會在下一個事件迴圈才撤銷，
 * 確保瀏覽器有時間開始讀取 blob。
 *
 * @param filename Suggested file name.
 * @param content  Text content.
 * @param mime     MIME type, e.g. `application/xml`.
 */
export function downloadFile(filename: string, content: string, mime: string): void {
  const blob = new Blob([content], { type: `${mime};charset=utf-8` })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 2000)
}

/**
 * Download several files at once, bundled into one ZIP when possible.
 *
 * Browsers prompt (and often auto-deny) repeated programmatic downloads, so the
 * default is a single archive. When `CompressionStream` is unavailable we fall
 * back to sequential downloads.
 *
 * 一次下載多個檔案：優先打包成單一 ZIP（瀏覽器對連續下載常會直接拒絕），
 * 若環境不支援 `CompressionStream` 則退回逐一下載。
 *
 * @param files    Files to deliver.
 * @param filename ZIP file name.
 * @returns `zip` when an archive was produced, `sequential` for the fallback.
 */
export async function downloadFiles(
  files: readonly DownloadPayload[],
  filename: string,
): Promise<'zip' | 'sequential'> {
  if (files.length === 1) {
    const only = files[0]
    downloadFile(only.name, only.content, only.mime)
    return 'sequential'
  }

  if (supportsCompression()) {
    const archive = await createZip(files)
    downloadBlob(filename, archive, 'application/zip')
    return 'zip'
  }

  files.forEach((file, index) => {
    // Small stagger: concurrent programmatic downloads are more likely to be blocked.
    window.setTimeout(() => downloadFile(file.name, file.content, file.mime), index * 250)
  })
  return 'sequential'
}

/** Trigger a download for a binary payload (used for the ZIP archive). */
function downloadBlob(filename: string, blob: Blob, mime: string): void {
  const url = URL.createObjectURL(new Blob([blob], { type: mime }))
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 2000)
}

/** Whether this browser can produce a DEFLATE stream (Chrome 80+, Safari 16.4+, Firefox 113+). */
export function supportsCompression(): boolean {
  return typeof CompressionStream === 'function'
}