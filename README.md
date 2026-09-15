# dsh-plugin-youcom

A [You.com](https://you.com) search + fetch provider plugin for [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) (`dsh`).

`dsh-plugin-youcom` is a Cordis plugin registering a `WebSearchProvider` (`POST /v1/search`) and a `WebFetchProvider` (`POST /v1/contents`) with the dsh web seam (`ctx.web`).

## Install

Third-party providers ship as out-of-tree plugins, discovered through the [`dsh-plugin`](https://github.com/topics/dsh-plugin) GitHub topic. Add this package to a profile:

```sh
dsh plugin --profile <your-profile> add @youdotcom-oss/dsh-plugin-youcom
```

`dsh plugin` forwards to pnpm in the profile directory, so pnpm must be on your PATH. Restart the profile afterward so the new bundle layer is composed into the plugin stack:

```sh
dsh --profile <your-profile>
```

Or mount it directly in a `cordis.patch.yml`. This package ships one (see [`cordis.patch.yml`](./cordis.patch.yml)) that inserts the row below into an existing `dsh-web` composition:

```yaml
- id: youcom
  name: '@youdotcom-oss/dsh-plugin-youcom'
  config:
    apiKey: !!js process.env.YDC_API_KEY
```

The quotes around `name` are required. A plain YAML scalar cannot begin with `@`.

Set `YDC_API_KEY` (get one at [you.com/platform/api-keys](https://you.com/platform/api-keys)), or pass `apiKey` directly in config.

### Config

| Field | Default | Meaning |
|---|---|---|
| `apiKey` | `$YDC_API_KEY` | You.com API key. Empty or absent makes both providers unavailable |
| `baseURL` | `https://ydc-index.io` | Endpoint base shared by `/v1/search` and `/v1/contents`. Must be `http(s)`, and any path prefix it carries (a proxy mount) is kept |
| `numResults` | (unset) | Default search result count when a request carries no `maxResults` |
| `includeNews` | `true` | Merge `results.news[]` into search sources alongside `results.web[]` |

### Picking this provider when more than one is mounted

`ctx.web` auto-selects a provider only when it is the sole one available. Stacking this alongside another search or fetch provider needs an explicit pin on the host's `web` row:

```yaml
- id: web
  config:
    searchProvider: youcom
    fetchProvider: youcom
```

## Known Limitations

- **`fetch`'s `statusCode` is always `200` on success.** `/v1/contents` retrieves and extracts server-side and reports no origin HTTP status, so a page that 404'd at the origin but still yielded extractable content is indistinguishable from a clean 200 here. A raw HTTP fetch provider reports the real code.
- **`fetch`'s `truncated` is always `false`.** `/v1/contents` documents no truncation signal, so this can under-report but never over-report.
- **Search results carry no generated answer.** `/v1/search` returns sources only, so `content` is omitted rather than invented, and a source with no snippet stays snippet-less.
- **Search result fields are snake_case on the wire** (`page_age`, `favicon_url`). This package parses the raw response with no SDK layer in between, so `src/types.ts` matches the wire casing directly. A `pageAge`-keyed mapper silently drops every `publishedAt`.
- **Error bodies come in five shapes**, depending on the endpoint and on which layer rejected the request. A gateway rejects an invalid key with `{"message": "..."}` before the request reaches the app, while the app itself returns `{"detail": "..."}`, `{"error": "..."}`, `{"detail": [{"msg": "..."}]}`, or `{"errors": [{"title": "..."}]}`. `src/error-message.ts` checks all of them.
- **DeepSeek Harness is in developer preview** and documents compatibility-breaking changes between releases. This package's peer dependencies track its prerelease line accordingly.

## Development

```sh
npm install
npm run build       # tsc -> lib/
npm run typecheck
npm test            # vitest, but read the warning below first
```

**`npm test` hits the live You.com API when `YDC_API_KEY` is set in your environment.** `tests/live-smoke.test.ts` skips only when the key is absent, so a plain `npm test` on a configured machine spends real quota. To run the offline suite alone:

```sh
env -u YDC_API_KEY npx vitest run
```

License

MIT
