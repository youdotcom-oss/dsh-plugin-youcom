/**
 * You.com-backed `WebSearchProvider` (`POST /v1/search`). Maps `results.web[]`
 * and `results.news[]` to citeable sources: the first non-blank snippet (or
 * `description` as a fallback) becomes `snippet`, and the wire's `page_age`
 * becomes `publishedAt`. You.com's search endpoint returns no generated
 * answer, so `content` is omitted rather than invented.
 *
 * The endpoint is `POST` with a JSON body — the TypeScript SDK's generated
 * operation still documents it as `GET` with query params, but the current
 * `youdotcom-python-sdk` (`sdk.py`'s `_build_request(method="POST", ...,
 * get_serialized_body=...)`) and the working `n8n-nodes-youdotcom` node both
 * confirm `POST` with a body is what the server actually accepts.
 * @module dsh-plugin-youcom/search-provider
 */

import { WebError } from '@deepseek-ai/dsh-web'
import type {
  WebSearchProvider,
  WebSearchRequest,
  WebSearchResult,
  WebSearchSource,
} from '@deepseek-ai/dsh-web'
import { buildClientInfoHeader } from './attribution.js'
import { extractYouComErrorMessage } from './error-message.js'
import { isAbortError, isValidBaseUrl } from './shared.js'
import type { YouComSearchResponse, YouComSearchResultEntry } from './types.js'

/** Stable id this provider registers under. */
export const YOUCOM_PROVIDER_ID = 'youcom'

/** Default You.com API endpoint base; `/v1/search` is appended. */
export const YOUCOM_DEFAULT_BASE_URL = 'https://ydc-index.io'

/** Resolved provider options (the plugin's `apply` supplies env-var and constant defaults). */
export interface YouComSearchProviderOptions {
  /** You.com API key. Empty/absent makes the provider unavailable. */
  apiKey: string
  /** Endpoint base; `/v1/search` is appended. */
  baseURL: string
  /** This package's version, sent in the `X-Client-Info` attribution header. */
  pluginVersion: string
  /** Default result count when a request carries no `maxResults`. */
  numResults?: number
  /** Whether `results.news[]` is merged into `sources[]` alongside `results.web[]`. */
  includeNews: boolean
}

/**
 * Map one You.com result entry to a normalized source, or `undefined` when it
 * carries no usable URL — a defensive guard since the field is typed
 * optional on the wire.
 *
 * @param entry - one entry of `results.web[]` or `results.news[]`.
 * @returns the normalized source, or `undefined` when the entry has no URL.
 */
export function mapYouComResult(entry: YouComSearchResultEntry): WebSearchSource | undefined {
  if (entry.url == null || entry.url.length === 0) return undefined
  const snippet = entry.snippets?.find(candidate => candidate.trim().length > 0) ?? entry.description
  return {
    url: entry.url,
    ...entry.title != null && entry.title.length > 0 ? { title: entry.title } : {},
    ...snippet != null && snippet.length > 0 ? { snippet } : {},
    ...entry.page_age != null && entry.page_age.length > 0 ? { publishedAt: entry.page_age } : {},
  }
}

/**
 * Map a You.com search response envelope to a normalized search result.
 *
 * @param response - the parsed `POST /v1/search` response body.
 * @param includeNews - whether `results.news[]` is merged in after `results.web[]`.
 * @returns the normalized result; URL-less entries are dropped ({@link mapYouComResult}).
 */
export function mapYouComSearchResponse(response: YouComSearchResponse, includeNews: boolean): WebSearchResult {
  const entries = [
    ...response.results?.web ?? [],
    ...includeNews ? response.results?.news ?? [] : [],
  ]
  const sources = entries
    .map(mapYouComResult)
    .filter((source): source is WebSearchSource => source !== undefined)
  // You.com's search endpoint returns no generated answer, so `content` is omitted. The web
  // service owns the final `maxResults` truncation, so this provider reports `truncated: false`.
  return { sources, truncated: false }
}

/** The You.com-backed search provider. */
export class YouComSearchProvider implements WebSearchProvider {
  readonly id = YOUCOM_PROVIDER_ID

  constructor(private readonly options: YouComSearchProviderOptions) {}

  available(): boolean {
    return this.options.apiKey.length > 0
      && isValidBaseUrl(this.options.baseURL)
      && (this.options.numResults === undefined || isPositiveInteger(this.options.numResults))
  }

  async search(request: WebSearchRequest, signal?: AbortSignal): Promise<WebSearchResult> {
    // A per-request bound wins over the configured default; either may be absent.
    const numResults = request.maxResults ?? this.options.numResults
    const url = new URL('/v1/search', this.options.baseURL)

    let response: Response
    try {
      response = await fetch(url, {
        method: 'POST',
        redirect: 'error',
        headers: {
          'x-api-key': this.options.apiKey,
          'content-type': 'application/json',
          'accept': 'application/json',
          'x-client-info': buildClientInfoHeader(this.options.pluginVersion),
        },
        body: JSON.stringify({
          query: request.query,
          ...numResults !== undefined ? { count: numResults } : {},
        }),
        ...signal !== undefined ? { signal } : {},
      })
    } catch (error: unknown) {
      if (isAbortError(error)) throw new WebError('You.com search aborted', 'WEB_ABORTED', { cause: error })
      throw new WebError(`You.com search request failed: ${String(error)}`, 'WEB_PROVIDER_ERROR', { cause: error })
    }

    if (!response.ok) {
      const status = response.status
      let message = `You.com API error (HTTP ${status})`
      try {
        const parsed: unknown = await response.json()
        const detail = extractYouComErrorMessage(parsed)
        if (detail !== undefined) message = detail
      } catch (error: unknown) {
        // An abort fired mid-body must surface as WEB_ABORTED, not be swallowed
        // into a generic HTTP-error message — cancellation is not a provider
        // error (the seam's cancellation contract).
        if (isAbortError(error)) throw new WebError('You.com search aborted', 'WEB_ABORTED', { cause: error })
        // Otherwise: the HTTP status is already captured in `message` above; a
        // malformed/non-JSON error body can only cost a richer provider message.
      }
      throw new WebError(message, 'WEB_PROVIDER_ERROR')
    }

    try {
      const payload = await response.json() as YouComSearchResponse
      return mapYouComSearchResponse(payload, this.options.includeNews)
    } catch (error: unknown) {
      if (isAbortError(error)) throw new WebError('You.com search aborted', 'WEB_ABORTED', { cause: error })
      throw new WebError(`You.com returned an unprocessable response body: ${String(error)}`, 'WEB_PROVIDER_ERROR', { cause: error })
    }
  }
}

/** True for a request limit that can be sent to You.com (a positive whole number). */
function isPositiveInteger(value: number): boolean {
  return Number.isInteger(value) && value > 0
}


