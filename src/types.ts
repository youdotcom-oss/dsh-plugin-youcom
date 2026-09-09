/**
 * Wire types for the You.com Search (`POST /v1/search`) and Contents
 * (`POST /v1/contents`) endpoints. Types only — no runtime code. Verified
 * against the current `youdotcom-python-sdk` models, not the (out of date)
 * TypeScript SDK, which still documents `/v1/search` as `GET`.
 * @module dsh-plugin-youcom/types
 */

/**
 * One entry of `results.web[]` or `results.news[]` in a search response.
 * Field names are snake_case because this is the literal wire shape confirmed by a live
 * call — the TypeScript SDK's docs show a camelCase example, but that's the SDK's own
 * post-deserialization renaming, not what the server actually sends. We parse the raw
 * response ourselves with no SDK layer in between, so the wire casing is what we get.
 */
export interface YouComSearchResultEntry {
  url: string
  title?: string
  description?: string
  snippets?: string[]
  /** ISO-8601 publication/crawl timestamp, or a provider-specific string; absent when unknown. */
  page_age?: string
}

/** You.com's search response envelope (`POST /v1/search`). */
export interface YouComSearchResponse {
  results?: {
    web?: YouComSearchResultEntry[]
    news?: YouComSearchResultEntry[]
  }
}

/**
 * One entry of You.com's contents response. The endpoint's wire response is
 * an array of these — one per requested URL, in request order — even for a
 * single-URL request.
 */
export interface YouComContentsResponse {
  url?: string
  title?: string
  html?: string | null
  markdown?: string | null
}
