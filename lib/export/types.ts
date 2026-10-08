/**
 * Shared types for the export layer.
 *
 * 匯出層共用型別。
 */

/** One file destined for the user's downloads folder. */
export interface DownloadPayload {
  /** File name including extension. */
  name: string
  /** UTF-8 text content. */
  content: string
  /** MIME type used for the blob. */
  mime: string
}