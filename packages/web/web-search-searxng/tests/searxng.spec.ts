/**
 * Tests for @deepseek-ai/dsh-web-search-searxng.
 * Covers SearXNGSearchProvider, result mapping, and plugin registration.
 */

import type { MockInstance } from 'vitest'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { WebError } from '@deepseek-ai/dsh-web'
import {
  SearXNGSearchProvider,
  SEARXNG_DEFAULT_BASE_URL,
  DEFAULT_TIMEOUT_MS,
  mapSearXNGResult,
  mapSearXNGResponse,
} from '@deepseek-ai/dsh-web-search-searxng'
import * as searxngPlugin from '@deepseek-ai/dsh-web-search-searxng'
import type { SearXNGSearchResponse, SearXNGResult, SearXNGSearchProviderOptions } from '@deepseek-ai/dsh-web-search-searxng'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeProvider(opts?: Partial<SearXNGSearchProviderOptions>): SearXNGSearchProvider {
  return new SearXNGSearchProvider({
    baseURL: opts?.baseURL ?? SEARXNG_DEFAULT_BASE_URL,
    ...opts?.apiKey != null ? { apiKey: opts.apiKey } : {},
    ...opts?.language != null ? { language: opts.language } : {},
    ...opts?.category != null ? { category: opts.category } : {},
    timeoutMs: opts?.timeoutMs ?? DEFAULT_TIMEOUT_MS,
  })
}

function mockFetchOk(body: unknown, status = 200): MockInstance {
  return vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
    new Response(JSON.stringify(body), {
      status,
      headers: { 'content-type': 'application/json' },
    }),
  )
}

function mockFetchError(error: unknown): MockInstance {
  return vi.spyOn(globalThis, 'fetch').mockRejectedValueOnce(error)
}

function mockFetchAbort(): MockInstance {
  const abortError = new DOMException('The operation was aborted', 'AbortError')
  return vi.spyOn(globalThis, 'fetch').mockRejectedValueOnce(abortError)
}

/** A minimal SearXNG-like response with two results. */
function sampleResponse(overrides?: Partial<SearXNGSearchResponse>): SearXNGSearchResponse {
  return {
    query: 'test query',
    results: [
      {
        url: 'https://example.com/1',
        title: 'Result One',
        content: 'Snippet for result one.',
        publishedDate: '2024-06-15 10:30:00',
        engine: 'google',
      },
      {
        url: 'https://example.com/2',
        title: 'Result Two',
        content: 'Snippet for result two.',
        publishedDate: null,
      },
    ],
    answers: [],
    suggestions: [],
    corrections: [],
    unresponsive_engines: [],
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// Plugin registration shape
// ---------------------------------------------------------------------------

describe('plugin module', () => {
  it('exports the expected names', () => {
    expect(searxngPlugin.name).toBe('web-search-searxng')
    expect(searxngPlugin.inject).toEqual(['web'])
    expect(searxngPlugin.SEARXNG_PROVIDER_ID).toBe('searxng')
    expect(searxngPlugin.SEARXNG_DEFAULT_BASE_URL).toBe('http://localhost:8080')
    expect(searxngPlugin.SearXNGSearchProvider).toBeDefined()
  })

  it('defines a Config schema', () => {
    expect(searxngPlugin.Config).toBeDefined()
    // Schema should accept valid config
    const parsed = searxngPlugin.Config({
      baseURL: 'http://localhost:8888',
      apiKey: 'test-key',
      language: 'en',
      category: 'general',
      timeoutMs: 10000,
    })
    expect(parsed.baseURL).toBe('http://localhost:8888')
    expect(parsed.apiKey).toBe('test-key')
    expect(parsed.timeoutMs).toBe(10000)
  })
})

// ---------------------------------------------------------------------------
// Provider ID and availability
// ---------------------------------------------------------------------------

describe('SearXNGSearchProvider', () => {
  it('has a stable provider id', () => {
    const provider = makeProvider()
    expect(provider.id).toBe('searxng')
  })

  describe('available()', () => {
    it('returns true when baseURL is parseable', () => {
      expect(makeProvider({ baseURL: 'http://localhost:8080' }).available()).toBe(true)
      expect(makeProvider({ baseURL: 'https://search.example.com' }).available()).toBe(true)
    })

    it('returns false when baseURL is not parseable', () => {
      expect(makeProvider({ baseURL: '' }).available()).toBe(false)
      expect(makeProvider({ baseURL: 'not-a-url' }).available()).toBe(false)
    })

    it('returns false when timeoutMs is zero or negative', () => {
      expect(makeProvider({ timeoutMs: 0 }).available()).toBe(false)
      expect(makeProvider({ timeoutMs: -1 }).available()).toBe(false)
    })
  })
})

// ---------------------------------------------------------------------------
// Result mapping
// ---------------------------------------------------------------------------

describe('mapSearXNGResult', () => {
  it('maps a complete result', () => {
    const result: SearXNGResult = {
      url: 'https://example.com',
      title: 'Example',
      content: 'An example page.',
      publishedDate: '2024-01-15 14:30:00',
    }
    const source = mapSearXNGResult(result)
    expect(source).toBeDefined()
    expect(source!.url).toBe('https://example.com')
    expect(source!.title).toBe('Example')
    expect(source!.snippet).toBe('An example page.')
    expect(source!.publishedAt).toBe('2024-01-15T14:30:00Z')
  })

  it('returns undefined for a result with no URL', () => {
    expect(mapSearXNGResult({})).toBeUndefined()
  })

  it('omits optional fields when absent', () => {
    const source = mapSearXNGResult({ url: 'https://example.com' })
    expect(source).toBeDefined()
    expect(source!.url).toBe('https://example.com')
    expect(source!.title).toBeUndefined()
    expect(source!.snippet).toBeUndefined()
    expect(source!.publishedAt).toBeUndefined()
  })

  it('normalizes SearXNG date format to ISO-8601', () => {
    const source = mapSearXNGResult({
      url: 'https://example.com',
      publishedDate: '2024-06-15 10:30:00',
    })
    expect(source!.publishedAt).toBe('2024-06-15T10:30:00Z')
  })

  it('handles null publishedDate', () => {
    const source = mapSearXNGResult({
      url: 'https://example.com',
      publishedDate: null,
    })
    expect(source!.publishedAt).toBeUndefined()
  })

  it('handles already-ISO dates', () => {
    const source = mapSearXNGResult({
      url: 'https://example.com',
      publishedDate: '2024-06-15T10:30:00Z',
    })
    expect(source!.publishedAt).toBe('2024-06-15T10:30:00Z')
  })
})

describe('mapSearXNGResponse', () => {
  it('maps a full response to WebSearchResult', () => {
    const response = sampleResponse()
    const result = mapSearXNGResponse(response)
    expect(result.sources).toHaveLength(2)
    expect(result.sources[0]!.url).toBe('https://example.com/1')
    expect(result.sources[1]!.url).toBe('https://example.com/2')
    expect(result.content).toBeUndefined()
    expect(result.truncated).toBe(false)
  })

  it('drops results with no URL', () => {
    const response = sampleResponse({
      results: [
        { url: 'https://example.com/1', title: 'Good', content: 'ok' },
        { title: 'No URL', content: 'dropped' },
      ] as SearXNGResult[],
    })
    const result = mapSearXNGResponse(response)
    expect(result.sources).toHaveLength(1)
    expect(result.sources[0]!.url).toBe('https://example.com/1')
  })

  it('handles empty results', () => {
    const result = mapSearXNGResponse({
      query: 'empty',
      results: [],
    })
    expect(result.sources).toHaveLength(0)
  })

  it('handles missing results field', () => {
    const result = mapSearXNGResponse({ query: 'missing' } as SearXNGSearchResponse)
    expect(result.sources).toHaveLength(0)
  })
})

// ---------------------------------------------------------------------------
// search() with mocked fetch
// ---------------------------------------------------------------------------

describe('SearXNGSearchProvider.search()', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('returns mapped results on a successful response', async () => {
    const mock = mockFetchOk(sampleResponse())
    const provider = makeProvider()

    const result = await provider.search({ query: 'test' })
    expect(result.sources).toHaveLength(2)
    expect(result.sources[0]!.url).toBe('https://example.com/1')

    // Verify the request URL
    const calledUrl = mock!.mock.calls[0]![0] as string
    expect(calledUrl).toContain('/search?')
    expect(calledUrl).toContain('q=test')
    expect(calledUrl).toContain('format=json')
  })

  it('sends Authorization header when apiKey is configured', async () => {
    const mock = mockFetchOk(sampleResponse())
    const provider = makeProvider({ apiKey: 'secret-123' })

    await provider.search({ query: 'test' })
    const headers = mock!.mock.calls[0]![1]!.headers as Record<string, string>
    expect(headers['authorization']).toBe('Bearer secret-123')
  })

  it('does not send Authorization header without apiKey', async () => {
    const mock = mockFetchOk(sampleResponse())
    const provider = makeProvider()

    await provider.search({ query: 'test' })
    const headers = mock!.mock.calls[0]![1]!.headers as Record<string, string>
    expect(headers['authorization']).toBeUndefined()
  })

  it('includes language and category query params when configured', async () => {
    const mock = mockFetchOk(sampleResponse())
    const provider = makeProvider({ language: 'de', category: 'news' })

    await provider.search({ query: 'test' })
    const calledUrl = mock!.mock.calls[0]![0] as string
    expect(calledUrl).toContain('language=de')
    expect(calledUrl).toContain('categories=news')
  })

  it('throws WEB_ABORTED on fetch abort (DOMException)', async () => {
    mockFetchAbort()
    const provider = makeProvider()

    await expect(provider.search({ query: 'test' })).rejects.toThrow(WebError)
    await expect(provider.search({ query: 'test' })).rejects.toMatchObject({
      code: 'WEB_ABORTED',
    })
  })

  it('throws WEB_PROVIDER_ERROR on fetch network failure', async () => {
    mockFetchError(new Error('getaddrinfo ENOTFOUND localhost'))
    const provider = makeProvider()

    await expect(provider.search({ query: 'test' })).rejects.toThrow(WebError)
    await expect(provider.search({ query: 'test' })).rejects.toMatchObject({
      code: 'WEB_PROVIDER_ERROR',
    })
  })

  it('throws WEB_PROVIDER_ERROR on non-2xx HTTP status', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response('Rate limit exceeded', {
        status: 429,
        headers: { 'content-type': 'text/plain' },
      }),
    )
    const provider = makeProvider()

    await expect(provider.search({ query: 'test' })).rejects.toMatchObject({
      code: 'WEB_PROVIDER_ERROR',
    })
  })

  it('throws WEB_PROVIDER_ERROR on unparseable JSON body', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response('not json', {
        status: 200,
        headers: { 'content-type': 'text/plain' },
      }),
    )
    const provider = makeProvider()

    await expect(provider.search({ query: 'test' })).rejects.toMatchObject({
      code: 'WEB_PROVIDER_ERROR',
    })
  })

  it('respects the timeoutMs setting', async () => {
    vi.useFakeTimers()
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(
      () => new Promise(() => { /* never resolves */ }),
    )
    const provider = makeProvider({ timeoutMs: 100 })

    const searchPromise = provider.search({ query: 'test' })
    vi.advanceTimersByTime(150)

    await expect(searchPromise).rejects.toMatchObject({ code: 'WEB_ABORTED' })
    expect(fetchSpy).toHaveBeenCalled()

    vi.useRealTimers()
  })

  it('accepts an external AbortSignal', async () => {
    const controller = new AbortController()
    mockFetchOk(sampleResponse())
    const prov = makeProvider()

    const searchPromise = prov.search({ query: 'test' }, controller.signal)
    controller.abort()

    await expect(searchPromise).rejects.toMatchObject({ code: 'WEB_ABORTED' })
  })
})
