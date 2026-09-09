import { afterEach, describe, expect, it, vi } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import WebRuntime from '@deepseek-ai/dsh-web'
import * as youcomPlugin from '../src/index.ts'
import { YouComFetchProvider, YOUCOM_FETCH_PROVIDER_ID, mapYouComContentsResponse } from '../src/fetch-provider.ts'

const options = { apiKey: 'youcom-key', baseURL: 'https://api.youcom.test', pluginVersion: '0.1.0' }

function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' }, ...init })
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('You.com contents mapping', () => {
  it('maps a markdown response to a text body', () => {
    expect(mapYouComContentsResponse({ url: 'https://a.test', markdown: '# Title' }, 'https://a.test'))
      .toEqual({ url: 'https://a.test', statusCode: 200, body: { kind: 'text', content: '# Title' }, truncated: false })
  })

  it('falls back to html when markdown is absent', () => {
    expect(mapYouComContentsResponse({ url: 'https://a.test', html: '<p>hi</p>' }, 'https://a.test'))
      .toEqual({ url: 'https://a.test', statusCode: 200, body: { kind: 'html', content: '<p>hi</p>' }, truncated: false })
  })

  it('falls back to the request URL when the response omits url', () => {
    expect(mapYouComContentsResponse({ markdown: 'hi' }, 'https://requested.test').url).toBe('https://requested.test')
  })

  it('throws WEB_PROVIDER_ERROR when neither markdown nor html is present', () => {
    expect(() => mapYouComContentsResponse({ url: 'https://a.test' }, 'https://a.test'))
      .toThrow(expect.objectContaining({ code: 'WEB_PROVIDER_ERROR' }))
  })

  it('treats an empty-string markdown as absent and falls back to html', () => {
    expect(mapYouComContentsResponse({ url: 'https://a.test', markdown: '', html: '<p>hi</p>' }, 'https://a.test').body)
      .toEqual({ kind: 'html', content: '<p>hi</p>' })
  })

  it('throws WEB_PROVIDER_ERROR when both markdown and html are empty strings', () => {
    expect(() => mapYouComContentsResponse({ url: 'https://a.test', markdown: '', html: '' }, 'https://a.test'))
      .toThrow(expect.objectContaining({ code: 'WEB_PROVIDER_ERROR' }))
  })
})

describe('YouComFetchProvider availability', () => {
  it('is unavailable without a key', () => {
    expect(new YouComFetchProvider({ ...options, apiKey: '' }).available()).toBe(false)
  })

  it('is available with a key', () => {
    expect(new YouComFetchProvider(options).available()).toBe(true)
  })

  it('is misconfigured when the base URL is unparseable', () => {
    expect(new YouComFetchProvider({ ...options, baseURL: 'not a url' }).available()).toBe(false)
  })
})

describe('YouComFetchProvider request mapping', () => {
  it('sends the url, requests markdown, and the API key header', async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ url: 'https://a.test', markdown: 'content' }))
    vi.stubGlobal('fetch', fetchMock)

    await new YouComFetchProvider(options).fetch({ url: 'https://a.test' })

    expect(fetchMock).toHaveBeenCalledOnce()
    const [url, init] = fetchMock.mock.calls[0] as unknown as [URL, RequestInit]
    expect(url.toString()).toBe('https://api.youcom.test/v1/contents')
    expect(init).toMatchObject({ method: 'POST', redirect: 'error' })
    expect((init.headers as Record<string, string>)['x-api-key']).toBe('youcom-key')
    expect(JSON.parse(init.body as string)).toEqual({ urls: ['https://a.test'], formats: ['markdown', 'html'] })
  })

  it('takes the first entry when the response is an array', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse([{ url: 'https://a.test', markdown: 'content' }])))
    const result = await new YouComFetchProvider(options).fetch({ url: 'https://a.test' })
    expect(result.body).toEqual({ kind: 'text', content: 'content' })
  })

  it('forwards the abort signal', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ url: 'https://a.test', markdown: 'content' })))
    const controller = new AbortController()
    await new YouComFetchProvider(options).fetch({ url: 'https://a.test' }, controller.signal)
    const fetchMock = vi.mocked(fetch)
    const [, init] = fetchMock.mock.calls[0] as unknown as [URL, RequestInit]
    expect(init.signal).toBe(controller.signal)
  })
})

describe('YouComFetchProvider error handling', () => {
  it('maps a 401 {detail} error to WEB_PROVIDER_ERROR with the provider message', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ detail: 'bad key' }, { status: 401 })))
    await expect(new YouComFetchProvider(options).fetch({ url: 'https://a.test' }))
      .rejects.toThrow(expect.objectContaining({ code: 'WEB_PROVIDER_ERROR', message: 'bad key' }))
  })

  it('maps a network failure to WEB_PROVIDER_ERROR', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new TypeError('connection refused'))))
    await expect(new YouComFetchProvider(options).fetch({ url: 'https://a.test' }))
      .rejects.toThrow(expect.objectContaining({ code: 'WEB_PROVIDER_ERROR' }))
  })

  it('maps an abort to WEB_ABORTED', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new DOMException('aborted', 'AbortError'))))
    await expect(new YouComFetchProvider(options).fetch({ url: 'https://a.test' }))
      .rejects.toThrow(expect.objectContaining({ code: 'WEB_ABORTED' }))
  })

  it('propagates the no-content WebError from response mapping', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ url: 'https://a.test' })))
    await expect(new YouComFetchProvider(options).fetch({ url: 'https://a.test' }))
      .rejects.toThrow(expect.objectContaining({ code: 'WEB_PROVIDER_ERROR' }))
  })
})

describe('dsh-plugin-youcom fetch registration', () => {
  it('registers the provider into ctx.web (HMR-safe)', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ url: 'https://a.test', markdown: 'hi' })))
    const ctx = new Context()
    await ctx.plugin(WebRuntime, { fetchProvider: YOUCOM_FETCH_PROVIDER_ID })
    const fiber = await ctx.plugin(youcomPlugin, { apiKey: 'youcom-key' })
    await expect(ctx.web.fetch({ url: 'https://a.test' })).resolves.toMatchObject({ body: { kind: 'text', content: 'hi' } })
    await fiber.dispose()
    await expect(ctx.web.fetch({ url: 'https://a.test' }))
      .rejects.toThrow(expect.objectContaining({ code: 'WEB_PROVIDER_CONFIGURED_MISSING' }))
  })
})
