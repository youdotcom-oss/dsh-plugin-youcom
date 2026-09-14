# dsh-plugin-youcom

A [You.com](https://you.com) search + fetch provider plugin for [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) (`dsh`), plus an opt-in research-focused agent preset.

Ships two things:

- **`dsh-plugin-youcom`** — a Cordis plugin registering a `WebSearchProvider` (`POST /v1/search`) and a `WebFetchProvider` (`POST /v1/contents`) with the dsh web seam (`ctx.web`).
- **`youcom-research`** — an agent preset composing a research-oriented persona around `web_search`/`web_fetch`, favoring Western-web-depth, cited sources over broad tool access.

## Install

`dsh`'s core repo has Issues/PRs disabled, so third-party search providers ship as out-of-tree plugins discovered via the `dsh-plugin` GitHub topic, not core PRs. Add this package to a profile:

```sh
dsh plugin --profile <your-profile> add @youdotcom-oss/dsh-plugin-youcom
```

Or mount it directly in a `cordis.patch.yml` (this package ships one — see [`cordis.patch.yml`](./cordis.patch.yml) — that inserts the row below into an existing `dsh-web` composition):

```yaml
- id: youcom
  name: @youdotcom-oss/dsh-plugin-youcom
  config:
    apiKey: !!js process.env.YDC_API_KEY
```

Set `YDC_API_KEY` (get one at [you.com/platform/api-keys](https://you.com/platform/api-keys)), or pass `apiKey` directly in config.

### Config

| Field | Default | Meaning |
|---|---|---|
| `apiKey` | `$YDC_API_KEY` | You.com API key; empty or absent makes both providers unavailable |
| `baseURL` | `https://ydc-index.io` | Endpoint base shared by `/v1/search` and `/v1/contents` |
| `numResults` | (unset) | Default search result count when a request carries no `maxResults` |
| `includeNews` | `true` | Merge `results.news[]` into search sources alongside `results.web[]` |

### Picking this provider when more than one is mounted

`ctx.web` auto-selects a provider only when it is the sole one available. Stacking this alongside another search/fetch provider needs an explicit pin on the host's `web` row:

```yaml
- id: web
  config:
    searchProvider: youcom
    fetchProvider: youcom
```

## The `youcom-research` agent preset

[`presets/youcom-research/`](./presets/youcom-research/) is a complete agent composition — not just a tool registration — scoped to sourced web research: a persona instructing citation-backed answers and preferring a `web_fetch` follow-up over asserting from a search snippet alone, plus `dsh-tool-web` mounted with no shell/filesystem tools alongside it.

It is not auto-installed by this package's `cordis.patch.yml`: a patch replaces a targeted row's whole config, so silently rewriting your `dsh-agent-presets` `roots` list would risk clobbering preset roots you already configured. Add it yourself:

```yaml
- id: agent-presets
  config:
    roots:
      - path: node_modules/@youdotcom-oss/dsh-plugin-youcom/presets
        trust: system
```

Then select `youcom-research` for a session the same way you'd select any other preset.

## Known Limitations and Deferred Work

- **Verified live against the real API on 2026-09-09** (`POST /v1/search`, `POST /v1/contents`, and an invalid-key rejection), not just against SDK docs — see the corrections below, all found only by that live call. The `youdotcom-typescript-sdk` is out of date: it still documents `/v1/search` as `GET`; the current `youdotcom-python-sdk` and a live call both confirm `POST` with a JSON body. Re-run the smoke test in `tests/` fixtures or a manual call before relying on a new field this package doesn't already map.
- **Search result fields are snake_case on the wire** (`page_age`, `favicon_url`), not the camelCase the TypeScript SDK's docs example shows — that's the SDK's own post-deserialization renaming, not what the server sends. This package parses the raw response itself with no SDK in between, so `src/types.ts` matches the wire casing directly (confirmed live; a `pageAge`-based mapper silently drops every `publishedAt`, which was an initial bug here until this pass caught it).
- **Error bodies come in more shapes than one SDK's docs suggest.** Confirmed live: an invalid key gets rejected at a gateway/authorizer layer with `{"message": "Forbidden"}` before ever reaching the app — a shape the `youdotcom-python-sdk`'s app-level error models (`{"detail": "..."}`, plus a `{"error": "..."}` / FastAPI-validation-array / JSON:API-array trio specific to `/v1/search`'s 422) don't document at all. `src/error-message.ts` checks all of these.
- **`fetch`'s `statusCode` is always `200` on success.** `/v1/contents` retrieves and extracts server-side and reports no origin HTTP status, so a page that 404'd at the origin but still yielded extractable content is indistinguishable from a clean 200 here — unlike `dsh-web-fetch-http`, which reports the real code.
- **`fetch`'s `truncated` is always `false`.** `/v1/contents` documents no truncation signal, so this can under-report but never over-report.
- **`PLUGIN_VERSION` in `src/index.ts` is a hand-maintained literal**, not read from `package.json` — bump it alongside every version bump.
- **The `youdotcom-oss/dsh-plugin-youcom` GitHub repo doesn't exist yet** — an assumption baked into `package.json`'s `repository`/`homepage` fields. (The npm name `@youdotcom-oss/dsh-plugin-youcom` is confirmed available as of 2026-09-09.)

## Development

```sh
npm install
npm run build       # tsc -> lib/
npm run typecheck
npm test            # vitest
```

`src/search-provider.ts` and `src/fetch-provider.ts` are thin adapters: cheap local `available()` checks, `WebError` with a routable `code` on every failure path, and no invented fields — a source with no snippet stays snippet-less rather than inventing one.

## License

MIT
