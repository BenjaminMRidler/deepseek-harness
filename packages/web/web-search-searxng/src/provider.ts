/**
 * `SearXNGSearchProvider`: a `WebSearchProvider` backed by a self-hosted SearXNG
 * instance. It calls SearXNG's JSON API (`GET /search?q=<query>&format=json`)
 * and maps the flat `results[]` into the seam's normalized `WebSearchResult`.
 *
 * SearXNG has no native result-count control, so `maxResults` is enforced by
 * the seam (truncating `sources[]` and setting `truncated`).
 *
 * @module @deepseek-ai/dsh-web-search-searxng/provider
 */

import { WebError } from '@deepseek-ai/dsh-web'
import type {
  WebSearchProvider,
  WebSearchRequest,
  WebSearchResult,
  WebSearchSource,
} from '@deepseek-ai/dsh-web'
import type { SearXNGSearchResponse } from './types.ts'

/** Stable id this provider registers under. */
export const SEARXNG_PROVIDER_ID = 'searxng'

/** Default SearXNG endpoint (localhost:8080 is SearXNG\'s Docker default port). */
export const SEARXNG_DEFAULT_BASE_URL = 'http://localhost:8080'

/** Attribution header sent on every request. Bump with the package version. */
const USER_AGENT = 'deepseek-harness/0.0.1'

/** Default HTTP request timeout in milliseconds. */
export const DEFAULT_TIMEOUT_MS = 15_000

/** Resolved provider options (the plugin\'s apply supplies env-var and constant defaults). */
export interface SearXNGSearchProviderOptions {
  /** SearXNG instance base URL (protocol + host + port, no trailing slash). */
  baseURL: string
  /**
   * Optional SearXNG API key (set via search.api_key in settings.yml).
   * Empty/absent means no API key is sent.
   */
  apiKey?: string | undefined
  /**
   * Optional search language (e.g. en, de, zh). Sent as language.
   * Omitted = no language filter.
   */
  language?: string
  /**
   * Optional SearXNG category (e.g. general, news, images).
   * Omitted = SearXNG default (all categories).
   */
  category?: string
  /**
   * Optional HTTP request timeout in milliseconds. Defaults to 15000 (15s).
   */
  timeoutMs?: number
}

/**
 * Parse an ISO-like date string from SearXNG into the seam\'s expected format.
 * SearXNG returns dates like "2024-01-15 14:30:00" (space-separated, no
 * timezone). We normalize to ISO-8601 by replacing the space with T and
 * appending Z. Non-parseable values are omitted.
 */
function normalizeDate(raw: string | null | undefined): string | undefined {
  if (raw == null || raw.length === 0) return undefined
  // SearXNG returns "YYYY-MM-DD HH:mm:ss" -- replace space with T and append Z
  const iso = raw.includes('T') ? raw : raw.replace(' ', 'T') + 'Z'
  // Validate by attempting to parse
  if (Number.isNaN(Date.parse(iso))) return undefined
  return iso
}

/**
 * Map one SearXNG result to a normalized source, or undefined when it has
 * no url (the seam requires at least a URL to be citeable).
 */
export function mapSearXNGResult(result: {
  url?: string
  title?: string
  content?: string
  publishedDate?: string | null
}): WebSearchSource | undefined {
  if (result.url == null || result.url.length === 0) return undefined
  const snippet = result.content != null && result.content.length > 0 ? result.content : undefined
  const publishedAt = normalizeDate(result.publishedDate)
  return {
    url: result.url,
    ...result.title != null && result.title.length > 0 ? { title: result.title } : {},
    ...snippet != null ? { snippet } : {},
    ...publishedAt != null ? { publishedAt } : {},
  }
}

/**
 * Map a SearXNG response envelope to a normalized search result.
 * Answers are not mapped into sources; they are dropped by design because
 * SearXNG answers are engine-specific and not reliably citeable.
 */
export function mapSearXNGResponse(response: SearXNGSearchResponse): WebSearchResult {
  const sources = (response.results ?? [])
    .map(mapSearXNGResult)
    .filter((source): source is WebSearchSource => source !== undefined)
  // SearXNG returns no generated answer, so content is omitted.
  // The web service owns the final maxResults truncation.
  return { sources, truncated: false }
}

/** The SearXNG-backed search provider; HTTP redirects fail as WEB_PROVIDER_ERROR. */
export class SearXNGSearchProvider implements WebSearchProvider {
  readonly id = SEARXNG_PROVIDER_ID

  constructor(private readonly options: SearXNGSearchProviderOptions) {}

  available(): boolean {
    return URL.canParse(this.options.baseURL) && (this.options.timeoutMs ?? DEFAULT_TIMEOUT_MS) > 0
  }

  async search(request: WebSearchRequest, signal?: AbortSignal): Promise<WebSearchResult> {
    const url = this.buildSearchUrl(request.query)
    const controller = new AbortController()

    // Link parent signal for cancellation, with our own timeout as safety net
    const timeout = setTimeout(() => controller.abort(), this.options.timeoutMs ?? DEFAULT_TIMEOUT_MS)
    if (signal !== undefined) {
      signal.addEventListener('abort', () => controller.abort(), { once: true })
    }

    let response: Response
    try {
      const headers: Record<string, string> = {
        'accept': 'application/json',
        'user-agent': USER_AGENT,
      }
      if (this.options.apiKey != null && this.options.apiKey.length > 0) {
        headers['authorization'] = `Bearer ${this.options.apiKey}`
      }

      response = await fetch(url, {
        method: 'GET',
        redirect: 'error',
        headers,
        signal: controller.signal,
      })
    } catch (error: unknown) {
      if (isAbortError(error)) throw new WebError('SearXNG search aborted', 'WEB_ABORTED', { cause: error })
      throw new WebError(`SearXNG search request failed: ${String(error)}`, 'WEB_PROVIDER_ERROR', { cause: error })
    } finally {
      clearTimeout(timeout)
    }

    if (!response.ok) {
      const status = response.status
      let message = `SearXNG API error (HTTP ${status})`
      try {
        const body = await response.text() as string
        if (body.length > 0) message = body.slice(0, 500)
      } catch {
        // Best-effort error body read
      }
      throw new WebError(message, 'WEB_PROVIDER_ERROR')
    }

    try {
      const payload = await response.json() as SearXNGSearchResponse
      return mapSearXNGResponse(payload)
    } catch (error: unknown) {
      if (isAbortError(error)) throw new WebError('SearXNG search aborted', 'WEB_ABORTED', { cause: error })
      throw new WebError(`SearXNG returned an unprocessable response body: ${String(error)}`, 'WEB_PROVIDER_ERROR', { cause: error })
    }
  }

  /**
   * Build the SearXNG search URL with query params.
   * Uses the JSON API: /search?q=<query>&format=json
   */
  private buildSearchUrl(query: string): string {
    const params = new URLSearchParams()
    params.set('q', query)
    params.set('format', 'json')
    if (this.options.language != null && this.options.language.length > 0) {
      params.set('language', this.options.language)
    }
    if (this.options.category != null && this.options.category.length > 0) {
      params.set('categories', this.options.category)
    }
    return `${this.options.baseURL}/search?${params.toString()}`
  }
}

/** True for a fetch/AbortSignal abort, surfaced as WEB_ABORTED. */
function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError'
}
