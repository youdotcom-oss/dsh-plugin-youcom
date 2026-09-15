/**
 * Utilities shared by the search and fetch providers.
 * @module dsh-plugin-youcom/shared
 */

/** True when `baseURL` is an absolute `http(s)` URL (a cheap local config check). */
export function isValidBaseUrl(baseURL: string): boolean {
  if (!URL.canParse(baseURL)) return false
  // `URL.canParse` alone accepts any scheme, and resolving a path against a non-hierarchical
  // one throws: a scheme-less `localhost:8080` parses as scheme `localhost:`, so `available()`
  // would report usable and the throw would then escape this provider's `WebError` contract.
  const { protocol } = new URL(baseURL)
  return protocol === 'https:' || protocol === 'http:'
}

/**
 * Resolve one API path against the configured base.
 *
 * @param baseURL - the configured endpoint base; any path prefix it carries is kept.
 * @param path - the endpoint path, relative (no leading slash).
 * @returns the absolute request URL.
 */
export function resolveApiUrl(baseURL: string, path: string): URL {
  // A leading-slash path would discard a proxy base's prefix (`https://gw.test/youcom` +
  // `/v1/search` resolves to `https://gw.test/v1/search`), so resolve relatively against a
  // slash-terminated base, which leaves the default origin-only base unchanged.
  return new URL(path, baseURL.endsWith('/') ? baseURL : `${baseURL}/`)
}

/** True for a fetch/`AbortSignal` abort, surfaced as `WEB_ABORTED`. */
export function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError'
}