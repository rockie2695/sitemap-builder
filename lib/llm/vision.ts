/**
 * Vision fallback: read a SERP from a screenshot with a vision-capable model.
 *
 * Only used when the DOM extractor finds nothing (the engine changed its markup) or when
 * the page is otherwise unreadable. It is opt-in — the server enables it by setting
 * `LLM_VISION_MODEL` (a vision-capable model id) alongside `LLM_BASE_URL`.
 *
 * 視覺備援：用支援視覺的模型從截圖讀取 SERP。僅在 DOM 擷取不到結果（版面變更）或頁面
 * 無法解讀時使用。屬於選用：伺服器需設定 `LLM_VISION_MODEL`（支援視覺的模型）與 `LLM_BASE_URL`。
 */
import type { LlmConfig } from './openai'
import { chatCompletion, extractJson, type ChatMessage } from './openai'

/** One organic result read from the image. */
export interface VisionSerpEntry {
  position: number
  url: string
  title: string
}

/** Instruction sent with the screenshot. */
export const VISION_PROMPT =
  'This is a screenshot of a search-engine results page. List ONLY the organic results, ' +
  'top to bottom, skipping ads, "people also ask" boxes and navigation. Reply with ONLY ' +
  'a JSON object shaped exactly like {"results": [{"position": number, "url": string, ' +
  '"title": string}]}. Use the visible destination URL/hostname; if a result has no ' +
  'readable URL, omit it.'

/** Build the chat messages carrying the screenshot. */
export function buildVisionMessages(imageDataUrl: string): ChatMessage[] {
  return [
    {
      role: 'user',
      content: [
        { type: 'text', text: VISION_PROMPT },
        { type: 'image_url', image_url: { url: imageDataUrl } },
      ],
    },
  ]
}

/** Coerce a parsed value into a list of results. */
export function parseVisionSerp(raw: unknown): VisionSerpEntry[] {
  const list = (raw as { results?: unknown })?.results
  if (!Array.isArray(list)) return []

  const entries: VisionSerpEntry[] = []
  for (const item of list) {
    const record = (item ?? {}) as Record<string, unknown>
    const url = typeof record.url === 'string' ? record.url.trim() : ''
    if (!url) continue
    entries.push({
      position: typeof record.position === 'number' ? record.position : entries.length + 1,
      url,
      title: typeof record.title === 'string' ? record.title.trim() : '',
    })
  }
  return entries
}

/**
 * Read the organic results out of a PNG screenshot.
 *
 * @param config          Endpoint + (vision) model.
 * @param imageBase64Png  PNG bytes, base64 (no data-URL prefix).
 * @throws {LlmError} Propagated from {@link chatCompletion} / {@link extractJson}.
 */
export async function readSerpFromScreenshot(
  config: LlmConfig,
  imageBase64Png: string,
  signal?: AbortSignal,
): Promise<VisionSerpEntry[]> {
  const messages = buildVisionMessages(`data:image/png;base64,${imageBase64Png}`)
  const text = await chatCompletion(config, messages, signal)
  return parseVisionSerp(extractJson<unknown>(text))
}