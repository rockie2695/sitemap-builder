/**
 * SEO rewrite suggestions via an OpenAI-compatible model.
 *
 * The prompt asks for a strict JSON answer (title / description / notes); parsing is
 * lenient so a chatty model still yields something usable.
 *
 * 以 OpenAI 相容模型產生 SEO 改寫建議。提示要求嚴格的 JSON 回應（title／description／notes），
 * 解析則採寬鬆策略，讓多話的模型也能給出可用結果。
 */
import type { LlmConfig } from './openai'
import { chatCompletion, extractJson } from './openai'

/** The model's answer. */
export interface SeoSuggestion {
  /** Proposed `<title>`. */
  title: string
  /** Proposed meta description. */
  description: string
  /** Short rationale / extra tips. */
  notes: string[]
}

/** Facts about the page being rewritten. */
export interface SuggestInput {
  url: string
  /** BCP-47-ish language hint for the copy (e.g. `zh-TW`, `en`). */
  language: string
  title: string | null
  description: string | null
  h1: string[]
  wordCount: number
  /** Failing check labels (already human-readable). */
  issues: string[]
  /** Top keywords found on the page. */
  keywords: string[]
}

/** Build the chat messages for one page. */
export function buildSuggestMessages(input: SuggestInput): Array<{ role: 'system' | 'user'; content: string }> {
  const system =
    'You are a concise on-page SEO copywriter. Reply with ONLY a JSON object, no prose, ' +
    'shaped exactly like {"title": string, "description": string, "notes": string[]}. ' +
    `Write the copy in ${input.language}. Keep the title within 60 characters and the ` +
    'meta description within 50–160 characters.'

  const current = [
    `URL: ${input.url}`,
    `Current title: ${input.title ?? '(missing)'}`,
    `Current meta description: ${input.description ?? '(missing)'}`,
    `H1: ${input.h1.join(' | ') || '(none)'}`,
    `Approximate word count: ${input.wordCount}`,
    `Top keywords: ${input.keywords.join(', ') || '(none)'}`,
    `On-page issues: ${input.issues.join(', ') || '(none)'}`,
  ].join('\n')

  const user =
    `${current}\n\n` +
    'Propose a better <title> and meta description for this page, and 2–4 very short notes ' +
    '(each under 120 characters) explaining the main changes. Return the JSON now.'

  return [
    { role: 'system', content: system },
    { role: 'user', content: user },
  ]
}

/** Coerce a parsed value into a {@link SeoSuggestion}. */
export function parseSuggestion(raw: unknown): SeoSuggestion {
  const record = (raw ?? {}) as Record<string, unknown>
  const title = typeof record.title === 'string' ? record.title.trim() : ''
  const description = typeof record.description === 'string' ? record.description.trim() : ''
  const notes = Array.isArray(record.notes)
    ? record.notes.filter((note): note is string => typeof note === 'string').map((note) => note.trim()).filter(Boolean)
    : []
  return { title, description, notes }
}

/**
 * Ask the model for one page's rewrite.
 *
 * @throws {LlmError} Propagated from {@link chatCompletion} / {@link extractJson}.
 */
export async function suggestSeoFields(
  config: LlmConfig,
  input: SuggestInput,
  signal?: AbortSignal,
): Promise<SeoSuggestion> {
  const text = await chatCompletion(config, buildSuggestMessages(input), signal)
  return parseSuggestion(extractJson<unknown>(text))
}