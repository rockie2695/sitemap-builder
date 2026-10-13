/**
 * zod schemas for the LLM suggestion API, shared by the route and the client.
 *
 * LLM 建議 API 的 zod schema，路由與客戶端共用。
 */
import { z } from 'zod'

/** Body accepted by `POST /api/seo/suggest`. */
export const suggestRequestSchema = z.object({
  url: z.url({ error: 'url 必须是合法的绝对地址' }),
  /** Copy language hint (e.g. `zh-TW`, `en`). */
  language: z.string().max(20).default('en'),
  title: z.string().max(500).nullable().default(null),
  description: z.string().max(1_000).nullable().default(null),
  h1: z.array(z.string().max(300)).max(10).default([]),
  wordCount: z.number().int().min(0).max(1_000_000).default(0),
  /** Failing check labels, already human-readable. */
  issues: z.array(z.string().max(300)).max(40).default([]),
  keywords: z.array(z.string().max(100)).max(20).default([]),
  /** Optional endpoint override from the UI; the API key stays server-side. */
  baseUrl: z.string().max(500).optional(),
  model: z.string().max(200).optional(),
})

/** Validated request. */
export type SuggestRequestInput = z.infer<typeof suggestRequestSchema>

/** Body returned by `POST /api/seo/suggest`. */
export const suggestResponseSchema = z.object({
  title: z.string(),
  description: z.string(),
  notes: z.array(z.string()),
  /** The model that answered, for display. */
  model: z.string().optional(),
  error: z.string().optional(),
  errorCode: z.enum(['no_config', 'network', 'invalid', 'empty']).optional(),
})

/** Validated response. */
export type SuggestResponsePayload = z.infer<typeof suggestResponseSchema>