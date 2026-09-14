/**
 * You.com search + fetch provider plugin for the DeepSeek Harness web
 * capability seam (`ctx.web`). Registers both a `WebSearchProvider`
 * (`POST /v1/search`) and a `WebFetchProvider` (`POST /v1/contents`) under one
 * plugin so a single `apiKey` config covers both.
 * @module dsh-plugin-youcom
 */

import type { Context } from '@deepseek-ai/cordis'
import { launchEnvironmentOf } from '@deepseek-ai/dsh-launch-environment'
import z from '@deepseek-ai/schemastery'
import type {} from '@deepseek-ai/dsh-web'
import { YOUCOM_DEFAULT_BASE_URL, YouComSearchProvider } from './search-provider.js'
import { YOUCOM_FETCH_DEFAULT_BASE_URL, YouComFetchProvider } from './fetch-provider.js'

export {
  YOUCOM_DEFAULT_BASE_URL,
  YOUCOM_PROVIDER_ID,
  YouComSearchProvider,
  mapYouComResult,
  mapYouComSearchResponse,
} from './search-provider.js'
export type { YouComSearchProviderOptions } from './search-provider.js'
export {
  YOUCOM_FETCH_DEFAULT_BASE_URL,
  YOUCOM_FETCH_PROVIDER_ID,
  YouComFetchProvider,
  mapYouComContentsResponse,
} from './fetch-provider.js'
export type { YouComFetchProviderOptions } from './fetch-provider.js'
export { buildClientInfoHeader } from './attribution.js'

/** This package's version, sent in the `X-Client-Info` attribution header. Bump with the package version. */
const PLUGIN_VERSION = '0.1.0'

/** Cordis plugin name used by loader diagnostics. */
export const name = 'dsh-plugin-youcom'

/** The web seam this plugin registers into. */
export const inject = ['web']

/** Plugin config (all optional — `apply` fills env-var and constant defaults). */
export interface Config {
  /** You.com API key. Falls back to `$YDC_API_KEY`. Empty → both providers unavailable. */
  apiKey?: string
  /** Endpoint base shared by `/v1/search` and `/v1/contents`. Defaults to the public API. */
  baseURL?: string
  /** Default search result count when a request carries no `maxResults`. Omitted = none. */
  numResults?: number
  /** Merge `results.news[]` into search sources alongside `results.web[]`. Defaults to `true`. */
  includeNews?: boolean
}

export const Config: z<Config> = z.object({
  apiKey: z.string(),
  baseURL: z.string(),
  numResults: z.number().step(1).min(1),
  includeNews: z.boolean(),
})

/** Register the You.com search and fetch providers with `ctx.web`. */
export function apply(ctx: Context, config: Config): void {
  const apiKey = config.apiKey ?? launchEnvironmentOf(ctx).get('YDC_API_KEY')?.value ?? ''
  const baseURL = config.baseURL

  ctx.web.registerSearchProvider(new YouComSearchProvider({
    apiKey,
    baseURL: baseURL ?? YOUCOM_DEFAULT_BASE_URL,
    pluginVersion: PLUGIN_VERSION,
    includeNews: config.includeNews ?? true,
    ...config.numResults !== undefined ? { numResults: config.numResults } : {},
  }))

  ctx.web.registerFetchProvider(new YouComFetchProvider({
    apiKey,
    baseURL: baseURL ?? YOUCOM_FETCH_DEFAULT_BASE_URL,
    pluginVersion: PLUGIN_VERSION,
  }))
}
