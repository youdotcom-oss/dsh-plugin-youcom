# dsh-plugin-youcom

A [You.com](https://you.com) search + fetch provider plugin for [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) (`dsh`), plus an opt-in research-focused agent preset.

Ships two things:

- **`dsh-plugin-youcom`** — a Cordis plugin registering a `WebSearchProvider` (`GET /v1/search`) and a `WebFetchProvider` (`POST /v1/contents`) with `ctx.web`, the same seam Exa/Perplexity/DeepSeek's own search providers use.
- **`youcom-research`** — an agent preset composing a research-oriented persona around `web_search`/`web_fetch`, favoring Western-web-depth, cited sources over broad tool access.

## Install

`dsh`'s core repo has Issues/PRs disabled, so third-party search providers ship as out-of-tree plugins discovered via the `dsh-plugin` GitHub topic, not core PRs. Add this package to a profile:

```sh
dsh plugin --profile <your-profile> add dsh-plugin-youcom
```

Or mount it directly in a `cordis.patch.yml` (this package ships one — see [`cordis.patch.yml`](./cordis.patch.yml) — that inserts the row below into an existing `dsh-web` composition):

```yaml
- id: youcom
  name: dsh-plugin-youcom
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
      - path: node_modules/dsh-plugin-youcom/presets
        trust: system
```

Then select `youcom-research` for a session the same way you'd select any other preset.

## Development

```sh
npm install
npm run build       # tsc -> lib/
npm run typecheck
npm test            # vitest
```

`src/search-provider.ts` and `src/fetch-provider.ts` are thin adapters, deliberately mirroring the shape of `@deepseek-ai/dsh-web-search-exa` and `@deepseek-ai/dsh-web-fetch-http` in the core repo: cheap local `available()` checks, `WebError` with a routable `code` on every failure path, and no invented fields — a source with no snippet stays snippet-less rather than inventing one.

## License

MIT
