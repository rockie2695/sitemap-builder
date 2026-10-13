/**
 * zod schemas for the GA4 analytics API, shared by the route and the client.
 *
 * GA4 分析 API 的 zod schema，路由與客戶端共用。
 */
import { z } from 'zod'

/** Body accepted by `POST /api/analytics`. */
export const analyticsRequestSchema = z.object({
  /** Page paths to fetch (leading slash, no origin). */
  paths: z.array(z.string().max(2_000)).min(1).max(5_000),
  /** Look-back window in days. */
  days: z.number().int().min(1).max(365).default(28),
})

/** Validated request. */
export type AnalyticsRequestInput = z.infer<typeof analyticsRequestSchema>

/** One traffic row. */
export const analyticsRowSchema = z.object({
  path: z.string(),
  pageViews: z.number(),
  sessions: z.number(),
})

/** Body returned by `POST /api/analytics`. */
export const analyticsResponseSchema = z.object({
  rows: z.array(analyticsRowSchema),
  error: z.string().optional(),
  errorCode: z.enum(['no_credentials', 'auth', 'network', 'invalid']).optional(),
})

/** Validated response. */
export type AnalyticsResponsePayload = z.infer<typeof analyticsResponseSchema>