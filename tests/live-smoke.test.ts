/**
 * Live smoke test: exercises the You.com search and fetch providers
 * against the real API using $YDC_API_KEY. Skipped when the key is not
 * set — these are integration tests, not a build gate.
 *
 * Run:
 *   YDC_API_KEY=<your-key> npx vitest run tests/live-smoke.test.ts
 *
 * The Cordis-based discovery deserves a separate section, too:
 *   the plugin's apply() loads into the harness's real web seam.
 */
import { describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import WebRuntime from '@deepseek-ai/dsh-web'
import * as youcomPlugin from '../src/index.js'

const apiKey = process.env.YDC_API_KEY

const describeLive = apiKey != null && apiKey.length > 0 ? describe : describe.skip

describeLive('Live You.com API', () => {
  it('searches and returns citeable sources', async () => {
    const ctx = new Context()
    await ctx.plugin(WebRuntime, { searchProvider: 'youcom' })
    const fiber = await ctx.plugin(youcomPlugin, { apiKey })

    const result = await ctx.web.search({ query: 'DeepSeek Harness' })
    // A real search for a well-known topic must return at least one source
    expect(result.sources.length).toBeGreaterThan(0)
    // Every source must have a URL
    for (const source of result.sources) {
      expect(source.url).toBeTruthy()
      // The URL must start with http/https
      expect(source.url).toMatch(/^https?:\/\//)
    }
    // content is never invented — the endpoint returns no generated answer
    expect(result.content).toBeUndefined()
    // truncated is always false — the provider delegates to the caller
    expect(result.truncated).toBe(false)

    await fiber.dispose()
  })

  it('fetches a page and returns markdown content', async () => {
    const ctx = new Context()
    await ctx.plugin(WebRuntime, { fetchProvider: 'youcom' })
    const fiber = await ctx.plugin(youcomPlugin, { apiKey })

    const result = await ctx.web.fetch({ url: 'https://example.com' })
    // example.com is a real page with content
    expect(result.body).toBeTruthy()
    expect(result.statusCode).toBe(200)
    expect(result.url).toBeTruthy()
    expect(result.truncated).toBe(false)

    // Should return markdown (we request [markdown, html] and markdown wins)
    expect(result.body.kind).toBe('text')
    expect(result.body.content.length).toBeGreaterThan(0)

    await fiber.dispose()
  })

  it('disposes cleanly (HMR-safe)', async () => {
    const ctx = new Context()
    await ctx.plugin(WebRuntime, { searchProvider: 'youcom', fetchProvider: 'youcom' })
    const fiber = await ctx.plugin(youcomPlugin, { apiKey })

    // Both providers are available
    await expect(ctx.web.search({ query: 'test' })).resolves.toBeDefined()
    await expect(ctx.web.fetch({ url: 'https://example.com' })).resolves.toBeDefined()

    // Dispose the plugin
    await fiber.dispose()

    // After disposal, both providers are gone
    await expect(ctx.web.search({ query: 'test' }))
      .rejects.toThrow(expect.objectContaining({ code: 'WEB_PROVIDER_CONFIGURED_MISSING' }))
    await expect(ctx.web.fetch({ url: 'https://example.com' }))
      .rejects.toThrow(expect.objectContaining({ code: 'WEB_PROVIDER_CONFIGURED_MISSING' }))
  })
})