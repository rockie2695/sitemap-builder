/**
 * zod schemas for the SERP API, shared by the route and the client.
 *
 * SERP API 的 zod schema，路由與客戶端共用。
 */
import { z } from 'zod'

import { SERP_DEFAULT_ANALYZE_TOP, SERP_MAX_ANALYZE_TOP } from '@/types/serp'

/** Body accepted by `POST /api/serp`. */
export const serpRequestSchema = z.object({
  /** Query text derived from one of our pages. */
  query: z.string().trim().min(1, { error: 'query 不能为空' }).max(200),
  /** Our page, used to compute the rank. */
  targetUrl: z.url({ error: 'targetUrl 必须是合法的绝对地址' }),
  /** Search engine to read. */
  engine: z.enum(['google', 'bing']).default('google'),
  /** Backend: `auto` prefers a configured paid API. */
  provider: z.enum(['auto', 'playwright', 'serpapi']).default('auto'),
  /** How many top competitors to analyse on-page. */
  analyzeTop: z.number().int().min(0).max(SERP_MAX_ANALYZE_TOP).default(SERP_DEFAULT_ANALYZE_TOP),
})

/** Validated request. */
export type SerpRequestInput = z.infer<typeof serpRequestSchema>

/** One organic result. */
export const serpResultSchema = z.object({
  position: z.number(),
  url: z.string(),
  title: z.string(),
  hostname: z.string(),
})

/** On-page metrics of a competitor. */
export const serpCompetitorSchema = z.object({
  url: z.string(),
  title: z.string().nullable(),
  titleLength: z.number(),
  descriptionLength: z.number(),
  h1Count: z.number(),
  wordCount: z.number(),
  structuredData: z.array(z.string()),
  error: z.string().optional(),
})

/** Body returned by `POST /api/serp`. */
export const serpResponseSchema = z.object({
  query: z.string(),
  engine: z.enum(['google', 'bing']),
  provider: z.enum(['playwright', 'serpapi']),
  rank: z.number().nullable(),
  results: z.array(serpResultSchema),
  competitors: z.array(serpCompetitorSchema),
  error: z.string().optional(),
  errorCode: z.enum(['blocked', 'empty', 'no_key', 'network', 'invalid']).optional(),
})

/** Validated response. */
export type SerpResponsePayload = z.infer<typeof serpResponseSchema>