/**
 * Defaults and limits for the client-side SERP queue.
 *
 * 前端 SERP 佇列的預設值與上限。
 */
import {
  SERP_DEFAULT_ANALYZE_TOP,
  SERP_DEFAULT_MAX_QUERIES,
  SERP_MIN_INTERVAL_MS,
  type SerpOptions,
} from '@/types/serp'

/** Default run options; also backfills fields missing from an older stored value. */
export const DEFAULT_SERP_OPTIONS: SerpOptions = {
  engine: 'google',
  provider: 'auto',
  maxQueries: SERP_DEFAULT_MAX_QUERIES,
  analyzeTop: SERP_DEFAULT_ANALYZE_TOP,
  minIntervalMs: SERP_MIN_INTERVAL_MS,
}

/** localStorage name (without the app prefix) for the collected SERP records. */
export const SERP_RESULTS_KEY = 'serp-results:v1'

/** localStorage name for the run options. */
export const SERP_OPTIONS_KEY = 'serp-options:v1'

/** Poll interval used while waiting inside the paused state. */
export const SERP_PAUSE_POLL_MS = 150