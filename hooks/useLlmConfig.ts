/**
 * `useLlmConfig` — the OpenAI-compatible endpoint the browser tells the server to use.
 *
 * Only the base URL and model live here; the API key is server-side (`LLM_API_KEY`) and
 * is never stored or sent from the browser.
 *
 * `useLlmConfig` —— 瀏覽器告訴伺服器要用的 OpenAI 相容端點。這裡只放 base URL 與模型；
 * API 金鑰在伺服器端（`LLM_API_KEY`），不會儲存或由瀏覽器送出。
 */
'use client'

import { useCallback } from 'react'

import { useStoredState } from '@/hooks/useStoredState'

/** Client-visible endpoint settings. */
export interface LlmClientConfig {
  /** e.g. `http://localhost:11434/v1`. Empty = use the server env default. */
  baseUrl: string
  /** e.g. `llama3.1`. Empty = use the server env default. */
  model: string
}

/** localStorage key for the endpoint settings. */
export const LLM_CONFIG_KEY = 'llm-config:v1'

/** Default (empty = defer to the server). */
export const DEFAULT_LLM_CONFIG: LlmClientConfig = { baseUrl: '', model: '' }

/**
 * Endpoint settings persisted in `localStorage`.
 *
 * @returns The current config and a patch setter.
 */
export function useLlmConfig(): [LlmClientConfig, (patch: Partial<LlmClientConfig>) => void] {
  const [config, setConfig] = useStoredState<LlmClientConfig>(LLM_CONFIG_KEY, DEFAULT_LLM_CONFIG)

  const patch = useCallback(
    (next: Partial<LlmClientConfig>) => {
      setConfig((previous) => ({ ...previous, ...next }))
    },
    [setConfig],
  )

  return [config, patch]
}