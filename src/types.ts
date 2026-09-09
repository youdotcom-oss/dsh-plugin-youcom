/**
 * Wire types for the You.com Search (`GET /v1/search`) and Contents
 * (`POST /v1/contents`) endpoints. Types only — no runtime code.
 * @module dsh-plugin-youcom/types
 */

/** One entry of `results.web[]` or `results.news[]` in a search response. */
export interface YouComSearchResultEntry {
  url: string
  title?: string
  description?: string
  snippets?: string[]
  /** ISO-8601 publication/crawl timestamp. */
  pageAge?: string
}

/** You.com's search response envelope (`GET /v1/search`). */
export interface YouComSearchResponse {
  results?: {
    web?: YouComSearchResultEntry[]
    news?: YouComSearchResultEntry[]
  }
}

/** You.com's error response envelope (best-effort; fields vary by failure). */
export interface YouComErrorResponse {
  error?: string
  message?: string
  detail?: string
}

/** You.com's contents response envelope (`POST /v1/contents`). */
export interface YouComContentsResponse {
  url?: string
  title?: string
  html?: string | null
  markdown?: string | null
}
