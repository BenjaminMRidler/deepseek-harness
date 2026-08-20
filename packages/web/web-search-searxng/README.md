# @deepseek-ai/dsh-web-search-searxng

English | [中文](README.zh.md)

A [SearXNG](https://docs.searxng.org)-backed `WebSearchProvider` for the harness [web capability seam](../web/README.md) (`ctx.web`).
It calls SearXNG's JSON API (`GET /search?q=<query>&format=json`) and maps the flat `results[]` into the seam's normalized
`WebSearchResult`.

This is an **implementation** package: it registers a provider into `ctx.web`, does not own the key, and does not register
a model-facing tool (that is `@deepseek-ai/dsh-tool-web`). Like `@deepseek-ai/dsh-llm-deepseek`, it is a function/namespace
plugin (`inject: ['web']`) that registers its backend, not a default-export service.

SearXNG is a self-hosted, privacy-respecting meta-search engine. You deploy it separately (Docker, pip, etc.) and point
this provider at its HTTP endpoint.

## Config

| Key | Default | Meaning |
|---|---|---|
| `baseURL` | `http://localhost:8080` | SearXNG instance base URL (protocol + host + port, no trailing slash). |
| `apiKey` | `$SEARXNG_API_KEY` | Optional SearXNG API key (set via `search.api_key` in `settings.yml`). Empty/absent = no key sent. |
| `language` | (unset) | Optional search language filter (e.g. `en`, `de`, `zh`). Omitted = no filter. |
| `category` | (unset) | Optional search category (e.g. `general`, `news`, `images`). Omitted = all categories. |
| `timeoutMs` | `15000` | HTTP request timeout in milliseconds. |

```yaml
- id: web-search-searxng
  name: '@deepseek-ai/dsh-web-search-searxng'
  config:
    baseURL: http://localhost:8888
```

## Usage

Add the provider to your profile and configure the `web` plugin to select it:

```yaml
# `$DSH_HOME/profiles/<name>/cordis.patch.yml`
- id: web
  name: '@deepseek-ai/dsh-web'
  config:
    searchProvider: searxng

- insert:
    - id: web-search-searxng
      name: '@deepseek-ai/dsh-web-search-searxng'
      config:
        baseURL: http://localhost:8888
```

The `dsh-tool-web` consumer automatically discovers the registered provider. No deployment change is needed there.

## Mapping

SearXNG returns a flat `results[]` and no generated answer, so `content` is omitted.
Each result maps to a `WebSearchSource`:

| Seam field | SearXNG field |
|---|---|
| `url` | `url` |
| `title` | `title` |
| `snippet` | `content` |
| `publishedAt` | `publishedDate` (normalized from `"YYYY-MM-DD HH:mm:ss"` to ISO-8601) |

SearXNG has no native result-count control, so `maxResults` is enforced by the seam
(truncating `sources[]` and setting `truncated`). Provider failures (HTTP errors,
network failure, unparseable bodies) surface as `WebError` `WEB_PROVIDER_ERROR`;
an aborted request surfaces as `WEB_ABORTED`.

## Model Experience

Indirectly, through [`dsh-tool-web`](../tool-web/README.md), which retains this provider's
`maxResults`-bounded URLs, titles, snippets, and publication dates.
This provider's exact failures are:
- `SearXNG search aborted`
- `SearXNG search request failed: <error>`
- `SearXNG API error (HTTP <status>)`
- `SearXNG returned an unprocessable response body: <error>`

and HTTP failures preserve the upstream error message. The consumer owns the error wrapper.

### KV Cache effect

No direct invalidation; the named consumer owns any request-prefix changes.

## Known Limitations and Deferred Work

- **No native result-count control** — SearXNG has no `numResults`-like parameter,
  so `maxResults` is enforced post-hoc by seam truncation. Over-returned sources
  still cost transfer time.
- **Date normalization is heuristic** — SearXNG's date format varies by upstream
  engine; the provider only normalizes the common `"YYYY-MM-DD HH:mm:ss"` format.
- **Only basic search controls are exposed** — SearXNG's advanced controls
  (engines, paging, safesearch, autocomplete) are not exposed, pending
  provider-neutral Service Definition fields.
- **Abort classification is error-shape-based** — only a `DOMException` named
  `AbortError` maps to `WEB_ABORTED`; an abort carrying a custom reason (e.g.
  `dsh-timeout`'s `TimeoutReason`) surfaces as `WEB_PROVIDER_ERROR`.
