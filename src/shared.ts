/**
 * Utilities shared by the search and fetch providers.
 * @module dsh-plugin-youcom/shared
 */

/** True when `baseURL` parses as an absolute URL (a cheap local config check). */
export function isValidBaseUrl(baseURL: string): boolean {
  return URL.canParse(baseURL)
}

/** True for a fetch/`AbortSignal` abort, surfaced as `WEB_ABORTED`. */
export function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError'
}