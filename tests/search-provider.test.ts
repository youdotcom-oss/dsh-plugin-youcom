import { afterEach, describe, expect, it, vi } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import WebRuntime from '@deepseek-ai/dsh-web'
import * as youcomPlugin from '../src/index.ts'
import { YouComSearchProvider, YOUCOM_PROVIDER_ID, mapYouComResult, mapYouComSearchResponse } from '../src/search-provider.ts'

const options = { apiKey: 'youcom-key', baseURL: 'https://api.youcom.test', pluginVersion: '0.1.0', includeNews: true }

function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' }, ...init })
}

/** A Response whose body read rejects the way an abort mid-read does. */
function abortingResponse(init: ResponseInit = {}): Response {
  const body = new ReadableStream({ start: controller => controller.error(new DOMException('aborted', 'AbortError')) })
  return new Response(body, { status: 200, ...init })
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('You.com result mapping', () => {
  it('maps a full result entry, preferring a snippet over description', () => {
    expect(mapYouComResult({
      url: 'https://a.test',
      title: 'A',
      description: 'fallback description',
      snippets: ['salient sentence', 'second'],
      page_age: '2026-01-01',
    })).toEqual({ url: 'https://a.test', title: 'A', snippet: 'salient sentence', publishedAt: '2026-01-01' })
  })

  it('falls back to description when snippets is empty or all-blank', () => {
    expect(mapYouComResult({ url: 'https://a.test', snippets: [], description: 'fallback' }))
      .toEqual({ url: 'https://a.test', snippet: 'fallback' })
    expect(mapYouComResult({ url: 'https://a.test', snippets: ['  '], description: 'fallback' }))
      .toEqual({ url: 'https://a.test', snippet: 'fallback' })
  })

  it('reads the wire\'s snake_case page_age, not a camelCase pageAge', () => {
    // Regression test: a live call confirmed the raw wire response is snake_case
    // (page_age, favicon_url, ...) — the TypeScript SDK's docs show a camelCase example,
    // but that's the SDK's own post-deserialization renaming, not what the server sends.
    expect(mapYouComResult({ url: 'https://a.test', page_age: '2026-01-01', snippets: ['hi'] }))
      .toEqual({ url: 'https://a.test', snippet: 'hi', publishedAt: '2026-01-01' })
  })

  it('drops a result with no URL', () => {
    expect(mapYouComResult({ url: '' })).toBeUndefined()
  })

  it('omits empty optional fields rather than emitting them', () => {
    expect(mapYouComResult({ url: 'https://a.test', title: '', page_age: '' }))
      .toEqual({ url: 'https://a.test' })
  })

  it('merges web and news sources when includeNews is true', () => {
    const result = mapYouComSearchResponse({
      results: {
        web: [{ url: 'https://a.test', snippets: ['one'] }],
        news: [{ url: 'https://b.test', snippets: ['two'] }],
      },
    }, true)
    expect(result).toEqual({
      sources: [
        { url: 'https://a.test', snippet: 'one' },
        { url: 'https://b.test', snippet: 'two' },
      ],
      truncated: false,
    })
    expect(result.content).toBeUndefined()
  })

  it('omits news sources when includeNews is false', () => {
    const result = mapYouComSearchResponse({
      results: {
        web: [{ url: 'https://a.test', snippets: ['one'] }],
        news: [{ url: 'https://b.test', snippets: ['two'] }],
      },
    }, false)
    expect(result.sources).toEqual([{ url: 'https://a.test', snippet: 'one' }])
  })

  it('tolerates a missing results object', () => {
    expect(mapYouComSearchResponse({}, true).sources).toEqual([])
  })
})

describe('YouComSearchProvider availability', () => {
  it('is unavailable without a key', () => {
    expect(new YouComSearchProvider({ ...options, apiKey: '' }).available()).toBe(false)
  })

  it('is available with a key', () => {
    expect(new YouComSearchProvider(options).available()).toBe(true)
  })

  it('is misconfigured when the base URL is unparseable', () => {
    expect(new YouComSearchProvider({ ...options, baseURL: 'not a url' }).available()).toBe(false)
  })

  it('is misconfigured when the base URL is parseable but not http(s)', () => {
    // A scheme-less `localhost:8080` parses as scheme `localhost:`, and resolving a path
    // against it throws — reporting it usable would let that throw escape as a bare
    // TypeError instead of a coded WebError.
    expect(new YouComSearchProvider({ ...options, baseURL: 'localhost:8080' }).available()).toBe(false)
    expect(new YouComSearchProvider({ ...options, baseURL: 'file:///etc/passwd' }).available()).toBe(false)
    expect(new YouComSearchProvider({ ...options, baseURL: 'http://localhost:8080' }).available()).toBe(true)
  })

  it('is misconfigured when numResults is set but not a positive integer', () => {
    expect(new YouComSearchProvider({ ...options, numResults: -1 }).available()).toBe(false)
    expect(new YouComSearchProvider({ ...options, numResults: 1.5 }).available()).toBe(false)
  })
})

describe('YouComSearchProvider request mapping', () => {
  it('sends query, count, and the API key header', async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ results: { web: [{ url: 'https://a.test', snippets: ['hi'] }] } }))
    vi.stubGlobal('fetch', fetchMock)

    const provider = new YouComSearchProvider(options)
    await provider.search({ query: 'hello', maxResults: 5 })

    expect(fetchMock).toHaveBeenCalledOnce()
    const [url, init] = fetchMock.mock.calls[0] as unknown as [URL, RequestInit]
    expect(url.toString()).toBe('https://api.youcom.test/v1/search')
    expect(init).toMatchObject({ method: 'POST', redirect: 'error' })
    expect((init.headers as Record<string, string>)['x-api-key']).toBe('youcom-key')
    expect((init.headers as Record<string, string>)['content-type']).toBe('application/json')
    expect((init.headers as Record<string, string>)['x-client-info']).toContain('client=dsh-plugin-youcom/0.1.0')
    expect(JSON.parse(init.body as string)).toEqual({ query: 'hello', count: 5 })
  })

  it('falls back to the configured numResults when a request omits maxResults', async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ results: {} }))
    vi.stubGlobal('fetch', fetchMock)
    await new YouComSearchProvider({ ...options, numResults: 7 }).search({ query: 'q' })
    const [, init] = fetchMock.mock.calls[0] as unknown as [URL, RequestInit]
    expect(JSON.parse(init.body as string)).toMatchObject({ count: 7 })
  })

  it('lets a request maxResults win over the configured numResults', async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ results: {} }))
    vi.stubGlobal('fetch', fetchMock)
    await new YouComSearchProvider({ ...options, numResults: 7 }).search({ query: 'q', maxResults: 2 })
    const [, init] = fetchMock.mock.calls[0] as unknown as [URL, RequestInit]
    expect(JSON.parse(init.body as string)).toMatchObject({ count: 2 })
  })

  it('omits count when neither maxResults nor a configured default is set', async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ results: {} }))
    vi.stubGlobal('fetch', fetchMock)
    await new YouComSearchProvider(options).search({ query: 'q' })
    const [, init] = fetchMock.mock.calls[0] as unknown as [URL, RequestInit]
    expect(JSON.parse(init.body as string)).not.toHaveProperty('count')
  })

  it('forwards the abort signal', async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ results: {} }))
    vi.stubGlobal('fetch', fetchMock)
    const controller = new AbortController()
    await new YouComSearchProvider(options).search({ query: 'q' }, controller.signal)
    const [, init] = fetchMock.mock.calls[0] as unknown as [URL, RequestInit]
    expect(init.signal).toBe(controller.signal)
  })

  it('keeps a path prefix on the configured base URL', async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ results: {} }))
    vi.stubGlobal('fetch', fetchMock)
    await new YouComSearchProvider({ ...options, baseURL: 'https://gateway.test/youcom' }).search({ query: 'q' })
    const [url] = fetchMock.mock.calls[0] as unknown as [URL, RequestInit]
    expect(url.toString()).toBe('https://gateway.test/youcom/v1/search')
  })
})

describe('YouComSearchProvider error handling', () => {
  it('maps a 401 {detail} error to WEB_PROVIDER_ERROR with the provider message', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ detail: 'bad key' }, { status: 401 })))
    await expect(new YouComSearchProvider(options).search({ query: 'q' }))
      .rejects.toThrow(expect.objectContaining({ code: 'WEB_PROVIDER_ERROR', message: 'bad key' }))
  })

  it('maps a 422 {error} (search-spec) error to WEB_PROVIDER_ERROR with the provider message', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ error: 'invalid_params' }, { status: 422 })))
    await expect(new YouComSearchProvider(options).search({ query: 'q' }))
      .rejects.toThrow(expect.objectContaining({ code: 'WEB_PROVIDER_ERROR', message: 'invalid_params' }))
  })

  it('maps a 422 {detail: [...]} (FastAPI validation) error, joining each entry\'s msg', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({
      detail: [{ type: 'value_error', loc: ['query'], msg: 'field required' }, { msg: 'count must be >= 1' }],
    }, { status: 422 })))
    await expect(new YouComSearchProvider(options).search({ query: 'q' }))
      .rejects.toThrow(expect.objectContaining({ code: 'WEB_PROVIDER_ERROR', message: 'field required; count must be >= 1' }))
  })

  it('maps a 422 {errors: [...]} (JSON:API) error, joining each entry\'s title', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({
      errors: [{ status: '422', code: 'bad_request', title: 'Malformed query' }],
    }, { status: 422 })))
    await expect(new YouComSearchProvider(options).search({ query: 'q' }))
      .rejects.toThrow(expect.objectContaining({ code: 'WEB_PROVIDER_ERROR', message: 'Malformed query' }))
  })

  it('maps a gateway-level {message} rejection (confirmed live with an invalid key) to WEB_PROVIDER_ERROR', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ message: 'Forbidden' }, { status: 403 })))
    await expect(new YouComSearchProvider(options).search({ query: 'q' }))
      .rejects.toThrow(expect.objectContaining({ code: 'WEB_PROVIDER_ERROR', message: 'Forbidden' }))
  })

  it('keeps a status-line message when the error body is not JSON', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('gateway down', { status: 502 })))
    await expect(new YouComSearchProvider(options).search({ query: 'q' }))
      .rejects.toThrow(expect.objectContaining({ code: 'WEB_PROVIDER_ERROR', message: 'You.com API error (HTTP 502)' }))
  })

  it('maps a network failure to WEB_PROVIDER_ERROR', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new TypeError('connection refused'))))
    await expect(new YouComSearchProvider(options).search({ query: 'q' }))
      .rejects.toThrow(expect.objectContaining({ code: 'WEB_PROVIDER_ERROR' }))
  })

  it('maps an abort to WEB_ABORTED', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new DOMException('aborted', 'AbortError'))))
    await expect(new YouComSearchProvider(options).search({ query: 'q' }))
      .rejects.toThrow(expect.objectContaining({ code: 'WEB_ABORTED' }))
  })

  it('maps an unparseable success body to WEB_PROVIDER_ERROR', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('not json', { status: 200 })))
    await expect(new YouComSearchProvider(options).search({ query: 'q' }))
      .rejects.toThrow(expect.objectContaining({ code: 'WEB_PROVIDER_ERROR' }))
  })

  it('maps an abort during the error-body read to WEB_ABORTED, not the HTTP status message', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => abortingResponse({ status: 500 })))
    await expect(new YouComSearchProvider(options).search({ query: 'q' }))
      .rejects.toThrow(expect.objectContaining({ code: 'WEB_ABORTED' }))
  })

  it('maps an abort during the success-body read to WEB_ABORTED', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => abortingResponse()))
    await expect(new YouComSearchProvider(options).search({ query: 'q' }))
      .rejects.toThrow(expect.objectContaining({ code: 'WEB_ABORTED' }))
  })
})

describe('dsh-plugin-youcom search registration', () => {
  it('registers the provider into ctx.web (HMR-safe)', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ results: {} })))
    const ctx = new Context()
    await ctx.plugin(WebRuntime, { searchProvider: YOUCOM_PROVIDER_ID })
    const fiber = await ctx.plugin(youcomPlugin, { apiKey: 'youcom-key' })
    await expect(ctx.web.search({ query: 'q' })).resolves.toMatchObject({ sources: [], truncated: false })
    await fiber.dispose()
    await expect(ctx.web.search({ query: 'q' }))
      .rejects.toThrow(expect.objectContaining({ code: 'WEB_PROVIDER_CONFIGURED_MISSING' }))
  })

  it('has no default export (namespace plugin export shape)', () => {
    expect('default' in youcomPlugin).toBe(false)
  })

  it('falls back to $YDC_API_KEY when config omits apiKey', async () => {
    const prev = process.env.YDC_API_KEY
    process.env.YDC_API_KEY = 'env-key'
    try {
      const fetchMock = vi.fn(async () => jsonResponse({ results: {} }))
      vi.stubGlobal('fetch', fetchMock)
      const ctx = new Context()
      await ctx.plugin(WebRuntime, { searchProvider: YOUCOM_PROVIDER_ID })
      const fiber = await ctx.plugin(youcomPlugin, {})
      await ctx.web.search({ query: 'q' })
      const [, init] = fetchMock.mock.calls[0] as unknown as [URL, RequestInit]
      expect((init.headers as Record<string, string>)['x-api-key']).toBe('env-key')
      await fiber.dispose()
    } finally {
      if (prev === undefined) delete process.env.YDC_API_KEY
      else process.env.YDC_API_KEY = prev
    }
  })

  it('is unavailable when neither config nor env supplies a key', async () => {
    const prev = process.env.YDC_API_KEY
    delete process.env.YDC_API_KEY
    try {
      const ctx = new Context()
      await ctx.plugin(WebRuntime, { searchProvider: YOUCOM_PROVIDER_ID })
      await ctx.plugin(youcomPlugin, {})
      await expect(ctx.web.search({ query: 'q' }))
        .rejects.toThrow(expect.objectContaining({ code: 'WEB_PROVIDER_CONFIGURED_UNAVAILABLE' }))
    } finally {
      if (prev !== undefined) process.env.YDC_API_KEY = prev
    }
  })
})
