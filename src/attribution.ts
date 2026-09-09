/**
 * Build the `X-Client-Info` attribution header value for outbound You.com API
 * requests, following the same convention as the other youdotcom-oss
 * integrations (n8n-nodes-youdotcom, langchain-youdotcom, pydantic-ai-harness):
 *
 *     sdk; client=dsh-plugin-youcom/<version>; ua=node/<version>
 *
 * Unlike the n8n plugin (which cannot read `process` under n8n Cloud's
 * community-node rules), this plugin runs as an ordinary Cordis plugin inside
 * a real Node.js process, so the `ua` segment reports the actual runtime
 * version instead of degrading to `unknown`.
 * @module dsh-plugin-youcom/attribution
 */

/** Leading literal that identifies the traffic source (the channel). */
const SOURCE_TOKEN = 'sdk'

/** This package's name, used in the `client=` segment. */
const PLUGIN_NAME = 'dsh-plugin-youcom'

/**
 * Build the `X-Client-Info` header value for an outbound API request.
 *
 * @param pluginVersion - this package's version, emitted as `client=dsh-plugin-youcom/<version>`.
 * @returns the header value to send over the wire.
 */
export function buildClientInfoHeader(pluginVersion: string): string {
  return [
    SOURCE_TOKEN,
    `client=${PLUGIN_NAME}/${pluginVersion}`,
    `ua=node/${process.version}`,
  ].join('; ')
}
