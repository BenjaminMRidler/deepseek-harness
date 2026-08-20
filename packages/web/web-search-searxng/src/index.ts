/**
 * @deepseek-ai/dsh-web-search-searxng: registers a SearXNG-backed
 * WebSearchProvider with ctx.web. A function/namespace plugin (NOT a
 * default-export service): a search provider does not own the ctx.web key --
 * it registers INTO the seam's provider registry, exactly as
 * @deepseek-ai/dsh-llm-deepseek registers an adapter into ctx.llm.
 * The key is owned by @deepseek-ai/dsh-web.
 *
 * @module @deepseek-ai/dsh-web-search-searxng
 */

import type { Context } from '@deepseek-ai/cordis'
import { launchEnvironmentOf } from '@deepseek-ai/dsh-launch-environment'
import z from '@deepseek-ai/schemastery'
import type {} from '@deepseek-ai/dsh-web'
import {
  SearXNGSearchProvider,
  SEARXNG_DEFAULT_BASE_URL,
} from './provider.ts'

export {
  SEARXNG_DEFAULT_BASE_URL,
  SEARXNG_PROVIDER_ID,
  SearXNGSearchProvider,
  DEFAULT_TIMEOUT_MS,
  mapSearXNGResult,
  mapSearXNGResponse,
} from './provider.ts'
export type { SearXNGSearchProviderOptions } from './provider.ts'
export type { SearXNGSearchResponse, SearXNGResult } from './types.ts'

/** Cordis plugin name used by loader diagnostics. */
export const name = 'web-search-searxng'

/** The web seam this provider registers into. */
export const inject = ['web']

/** Plugin config (all optional -- apply fills env-var and constant defaults). */
export interface Config {
  /** SearXNG instance base URL. Defaults to http://localhost:8080. */
  baseURL?: string
  /** Optional SearXNG API key. Falls back to $SEARXNG_API_KEY. Empty/absent = no key. */
  apiKey?: string
  /** Optional search language (e.g. en, de, zh). */
  language?: string
  /** Optional search category (e.g. general, news, images). */
  category?: string
  /** HTTP request timeout in ms. Defaults to 15000. */
  timeoutMs?: number
}

export const Config: z<Config> = z.object({
  baseURL: z.string(),
  apiKey: z.string(),
  language: z.string(),
  category: z.string(),
  timeoutMs: z.number().step(1).min(1),
})

/** Register the SearXNG search provider with ctx.web. */
export function apply(ctx: Context, config: Config): void {
  const envKey = launchEnvironmentOf(ctx).get('SEARXNG_API_KEY')?.value
  const apiKey = config.apiKey ?? envKey
  ctx.web.registerSearchProvider(new SearXNGSearchProvider({
    baseURL: config.baseURL ?? SEARXNG_DEFAULT_BASE_URL,
    ...apiKey != null && apiKey.length > 0 ? { apiKey } : {},
    ...config.language != null ? { language: config.language } : {},
    ...config.category != null ? { category: config.category } : {},
    ...config.timeoutMs != null ? { timeoutMs: config.timeoutMs } : {},
  }))
}
