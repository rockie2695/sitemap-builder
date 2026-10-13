/**
 * Minimal OpenAI-compatible chat client (zero dependency).
 *
 * Talks the `/chat/completions` protocol that OpenAI, Ollama, vLLM, llama.cpp and most
 * gateways expose, so the app can point at a local model without shipping a vendor SDK.
 * (The Vercel AI SDK's OpenAI provider speaks this same protocol; swapping this one
 * function is all it would take to use it.)
 *
 * The base URL and model are configurable; the API key is **server-side only**
 * (`LLM_API_KEY`) and never reaches the browser.
 *
 * 精簡的 OpenAI 相容聊天客戶端（零相依）。使用 OpenAI、Ollama、vLLM、llama.cpp 與多數
 * 閘道都支援的 `/chat/completions` 協定，因此可指向本機模型而不必引入廠商 SDK。
 * （Vercel AI SDK 的 OpenAI provider 走的是同一套協定，換掉這一個函式即可改用。）
 * base URL 與模型可設定；API 金鑰**只在伺服器端**（`LLM_API_KEY`），不會送到瀏覽器。
 */

/** Machine-readable failure kinds. */
export type LlmErrorCode = 'no_config' | 'network' | 'invalid' | 'empty'

/** A typed LLM failure. */
export class LlmError extends Error {
  constructor(
    readonly code: LlmErrorCode,
    message: string,
  ) {
    super(message)
    this.name = 'LlmError'
  }
}

/** Resolved endpoint settings. */
export interface LlmConfig {
  /** Base URL, e.g. `http://localhost:11434/v1`. */
  baseUrl: string
  /** Model id, e.g. `llama3.1` or `gpt-4o-mini`. */
  model: string
  /** Optional bearer token (server-side only). */
  apiKey?: string
}

/** One content part of a message (text or an image data URL). */
export interface ChatContentPart {
  type: 'text' | 'image_url'
  text?: string
  image_url?: { url: string }
}

/** A chat message. */
export interface ChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string | ChatContentPart[]
}

/** Trim a trailing slash so path concatenation is predictable. */
export function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.trim().replace(/\/+$/, '')
}

/**
 * Resolve the endpoint the server should use.
 *
 * Precedence: explicit request values (from the UI) → env → none. The key always comes
 * from the environment.
 *
 * @param override Base URL / model supplied by the caller.
 */
export function resolveLlmConfig(override: { baseUrl?: string; model?: string } = {}): LlmConfig | null {
  const baseUrl = normalizeBaseUrl(override.baseUrl || process.env.LLM_BASE_URL || '')
  const model = (override.model || process.env.LLM_MODEL || '').trim()
  if (!baseUrl || !model) return null
  return { baseUrl, model, apiKey: process.env.LLM_API_KEY || undefined }
}

/** The full completions endpoint for a base URL (tolerant of a user-supplied path). */
function chatEndpoint(baseUrl: string): string {
  if (/\/(chat\/completions)$/.test(baseUrl)) return baseUrl
  return `${baseUrl}/chat/completions`
}

/**
 * Resolve the endpoint used for the SERP vision fallback.
 *
 * Enabled only when `LLM_BASE_URL` **and** a vision-capable `LLM_VISION_MODEL` are set,
 * so the fallback stays off by default.
 */
export function resolveVisionConfig(): LlmConfig | null {
  const baseUrl = normalizeBaseUrl(process.env.LLM_BASE_URL || '')
  const model = (process.env.LLM_VISION_MODEL || '').trim()
  if (!baseUrl || !model) return null
  return { baseUrl, model, apiKey: process.env.LLM_API_KEY || undefined }
}

/**
 * Send one non-streaming chat completion and return the assistant text.
 *
 * @throws {LlmError} `network` / `invalid` / `empty`.
 */
export async function chatCompletion(
  config: LlmConfig,
  messages: readonly ChatMessage[],
  signal?: AbortSignal,
): Promise<string> {
  let response: Response
  try {
    response = await fetch(chatEndpoint(config.baseUrl), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(config.apiKey ? { Authorization: `Bearer ${config.apiKey}` } : {}),
      },
      body: JSON.stringify({ model: config.model, messages, stream: false, temperature: 0.2 }),
      signal,
    })
  } catch (error) {
    throw new LlmError('network', error instanceof Error ? error.message : String(error))
  }

  const payload = (await response.json().catch(() => ({}))) as {
    choices?: Array<{ message?: { content?: string } }>
    error?: { message?: string } | string
  }

  if (!response.ok) {
    const detail = typeof payload.error === 'string' ? payload.error : payload.error?.message
    throw new LlmError('invalid', detail ?? `LLM 请求失败（HTTP ${response.status}）`)
  }

  const content = payload.choices?.[0]?.message?.content
  if (typeof content !== 'string' || !content.trim()) {
    throw new LlmError('empty', '模型没有返回内容')
  }
  return content
}

/**
 * Pull the first JSON value out of a model answer.
 *
 * Models wrap JSON in prose or ```json fences despite instructions, so this is lenient:
 * it tries a straight parse, then a fenced block, then the first `{…}` / `[…]` span.
 *
 * @throws {LlmError} `invalid` when nothing parses.
 */
export function extractJson<T>(text: string): T {
  const trimmed = text.trim()

  const attempt = (candidate: string): T | undefined => {
    try {
      return JSON.parse(candidate) as T
    } catch {
      return undefined
    }
  }

  const direct = attempt(trimmed)
  if (direct !== undefined) return direct

  const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(trimmed)
  if (fenced) {
    const parsed = attempt(fenced[1].trim())
    if (parsed !== undefined) return parsed
  }

  const start = trimmed.search(/[[{]/)
  if (start >= 0) {
    const open = trimmed[start]
    const close = open === '{' ? '}' : ']'
    const end = trimmed.lastIndexOf(close)
    if (end > start) {
      const parsed = attempt(trimmed.slice(start, end + 1))
      if (parsed !== undefined) return parsed
    }
  }

  throw new LlmError('invalid', '模型回應不是合法 JSON')
}