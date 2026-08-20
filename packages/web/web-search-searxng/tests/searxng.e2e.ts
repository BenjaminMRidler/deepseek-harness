/**
 * Real-endpoint e2e test for @deepseek-ai/dsh-web-search-searxng.
 * Requires a running SearXNG instance. Self-skips when SEARXNG_TEST_BASE_URL
 * is not set.
 */

import { describe, expect, it } from 'vitest'
import { SearXNGSearchProvider } from '@deepseek-ai/dsh-web-search-searxng'

const TEST_BASE_URL = process.env.SEARXNG_TEST_BASE_URL

const describeOrSkip = TEST_BASE_URL != null && TEST_BASE_URL.length > 0 ? describe : describe.skip

describeOrSkip('SearXNGSearchProvider e2e', () => {
  const provider = new SearXNGSearchProvider({
    baseURL: TEST_BASE_URL!,
    timeoutMs: 10_000,
  })

  it('is available', () => {
    expect(provider.available()).toBe(true)
  })

  it('returns results for a simple query', async () => {
    const result = await provider.search({ query: 'test search', maxResults: 5 })
    expect(result.sources).toBeDefined()
    expect(result.sources.length).toBeGreaterThanOrEqual(1)
    expect(result.sources[0]!.url).toBeDefined()
    expect(result.sources[0]!.url.startsWith('http')).toBe(true)
    expect(result.sources[0]!.url.startsWith('http')).toBe(true)
  })
})
