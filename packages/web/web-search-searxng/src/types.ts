/**
 * SearXNG JSON API response types.
 * Based on the public SearXNG API: GET /search?q=<query>&format=json
 * @module @deepseek-ai/dsh-web-search-searxng/types
 */

/**
 * One result from SearXNG's `results[]`. All fields are optional in practice
 * depending on the upstream engine; the provider drops entries with no `url`.
 */
export interface SearXNGResult {
  readonly url?: string
  readonly title?: string
  readonly content?: string
  readonly publishedDate?: string | null
  readonly engine?: string
  readonly category?: string
  readonly template?: string
  readonly parsed_url?: string[]
  readonly thumbnail?: string
  readonly img_src?: string
  readonly engines?: string[]
  readonly positions?: number[]
  readonly score?: number
}

/**
 * An infobox from SearXNG's `infoboxes[]`. Not mapped into sources but
 * preserved for potential extension.
 */
export interface SearXNGInfobox {
  readonly infobox?: string
  readonly content?: string
  readonly url?: string
  readonly engine?: string
  readonly img_src?: string
  readonly urls?: ReadonlyArray<{
    title?: string
    url?: string
  }>
}

/**
 * The top-level SearXNG JSON API response envelope.
 */
export interface SearXNGSearchResponse {
  readonly query: string
  readonly number_of_results?: number | null
  readonly results?: ReadonlyArray<SearXNGResult>
  readonly answers?: ReadonlyArray<string>
  readonly infoboxes?: ReadonlyArray<SearXNGInfobox>
  readonly suggestions?: ReadonlyArray<string>
  readonly corrections?: ReadonlyArray<string>
  readonly unresponsive_engines?: ReadonlyArray<string>
  readonly engine_errors?: Record<string, string>
}
