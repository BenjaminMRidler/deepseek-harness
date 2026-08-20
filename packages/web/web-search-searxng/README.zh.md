# @deepseek-ai/dsh-web-search-searxng

[English](README.md) | 中文

[SearXNG](https://docs.searxng.org) 搜索引擎，用于 Harness [Web 能力 seam](../web/README.md) (`ctx.web`) `WebSearchProvider`。
它调用 SearXNG 的 JSON API（`GET /search?q=<query>&format=json`）并将 `results[]` 映射为标准化的 `WebSearchResult`。

这是一个**实现**包：它在 `ctx.web` 中注册一个 provider，不拥有该键，也不注册面向模型的工具（那是
`@deepseek-ai/dsh-tool-web` 的职责）。与 `@deepseek-ai/dsh-llm-deepseek` 类似，它是一个函数/命名空间插件
（`inject: ['web']`），注册其后端，而非默认导出服务。

SearXNG 是一个自托管的、尊重隐私的元搜索引擎。你需要单独部署它（Docker、pip 等），然后让此 provider
指向它的 HTTP 端点。

## 配置

| 键 | 默认值 | 含义 |
|---|---|---|
| `baseURL` | `http://localhost:8080` | SearXNG 实例的基础 URL（协议+主机+端口，无尾部斜杠）。 |
| `apiKey` | `$SEARXNG_API_KEY` | 可选的 SearXNG API 密钥（在 `settings.yml` 中通过 `search.api_key` 设置）。空值=不发送密钥。 |
| `language` | (未设置) | 可选的搜索语言过滤（如 `en`、`de`、`zh`）。不设置=无过滤。 |
| `category` | (未设置) | 可选的搜索分类（如 `general`、`news`、`images`）。不设置=所有分类。 |
| `timeoutMs` | `15000` | HTTP 请求超时时间（毫秒）。 |

```yaml
- id: web-search-searxng
  name: '@deepseek-ai/dsh-web-search-searxng'
  config:
    baseURL: http://localhost:8888
```

## 使用方式

将 provider 添加到你的 profile，并配置 `web` 插件以选择它：

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

`dsh-tool-web` 消费者会自动发现已注册的 provider，无需修改部署配置。

## 映射

SearXNG 返回扁平的 `results[]` 且不生成回答，因此 `content` 会被省略。
每个结果映射到 `WebSearchSource`：

| Seam 字段 | SearXNG 字段 |
|---|---|
| `url` | `url` |
| `title` | `title` |
| `snippet` | `content` |
| `publishedAt` | `publishedDate`（从 `"YYYY-MM-DD HH:mm:ss"` 标准化为 ISO-8601） |

SearXNG 没有原生的结果数量控制，因此 `maxResults` 由 seam 强制执行
（截断 `sources[]` 并设置 `truncated`）。provider 失败（HTTP 错误、网络故障、
无法解析的响应体）会引发 `WebError` `WEB_PROVIDER_ERROR`；中止的请求会引发
`WEB_ABORTED`。

## 模型体验

间接通过 [`dsh-tool-web`](../tool-web/README.md)，它会保留此 provider 的 `maxResults`
限制后的 URL、标题、摘要和发布日期。此 provider 的确切失败信息为：
- `SearXNG search aborted`
- `SearXNG search request failed: <error>`
- `SearXNG API error (HTTP <status>)`
- `SearXNG returned an unprocessable response body: <error>`

HTTP 失败会保留上游错误消息。消费者拥有错误包装器。

### KV 缓存影响

无直接失效；具名消费者拥有任何请求前缀变更。

## 已知限制与待办工作

- **无原生结果数量控制** — SearXNG 没有类似 `numResults` 的参数，
  因此 `maxResults` 由 seam 事后强制截断。超出的结果仍会产生传输开销。
- **日期标准化是启发式的** — SearXNG 的日期格式因上游引擎而异；
  provider 仅标准化常见的 `"YYYY-MM-DD HH:mm:ss"` 格式。
- **仅暴露基本搜索控制** — SearXNG 的高级控制（引擎、分页、安全搜索、自动补全）
  尚未暴露，等待 provider 中立的 Service Definition 字段。
- **基于错误形状的中止分类** — 仅命名为 `AbortError` 的 `DOMException`
  映射为 `WEB_ABORTED`；带有自定义原因的中止（例如 `dsh-timeout` 的
  `TimeoutReason`）会引发 `WEB_PROVIDER_ERROR`。