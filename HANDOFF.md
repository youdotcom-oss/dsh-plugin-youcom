# Handoff: dsh-plugin-youcom (DX-736)

> For the next LLM: audit this project independently. This document captures
> every decision, verification result, and open question so you don't redo the
> research.

## Identity

| Field | Value |
|-------|-------|
| npm package | `@youdotcom-oss/dsh-plugin-youcom` (v0.1.0) |
| GitHub repo | `youdotcom-oss/dsh-plugin-youcom` |
| Linear task | DX-736: "[Agent Stack] DeepSeek Harness (dsh) — ship You.com search plugin + research profile bundle" |
| License | MIT |
| Cordis plugin name | `dsh-plugin-youcom` |
| Preset name | `youcom-research` |

## What this is

A Cordis plugin for the DeepSeek Harness (`dsh`) web capability seam (`ctx.web`).
Registers two providers under one package:

- **`WebSearchProvider`** → `POST https://ydc-index.io/v1/search` (JSON body, `x-api-key` header)
- **`WebFetchProvider`** → `POST https://ydc-index.io/v1/contents` (JSON body, `x-api-key` header)

Also bundles a **`youcom-research`** agent preset (`presets/youcom-research/`) — a
research-focused persona scoped to `web_search`/`web_fetch` without shell/filesystem
tools. This preset ships *inside* the plugin package (same pattern as upstream
`@deepseek-ai/dsh-agent-presets` bundling `standard`/`minimal`/`ptc`/`cordis`).

## File inventory

```
src/
  index.ts           — Plugin entry: Cordis name/inject/Config/apply()
  search-provider.ts — YouComSearchProvider (POST /v1/search)
  fetch-provider.ts  — YouComFetchProvider (POST /v1/contents)
  types.ts           — Wire types (YouComSearchResponse, YouComContentsResponse)
  error-message.ts   — Extracts messages from 5 You.com error body shapes
  attribution.ts     — X-Client-Info header builder
  shared.ts          — Shared utilities (isValidBaseUrl, isAbortError)
tests/
  search-provider.test.ts — 30 tests (mapping, availability, requests, errors, registration)
  fetch-provider.test.ts  — 17 tests (mapping, availability, requests, errors, registration)
  live-smoke.test.ts      — 3 tests (search, fetch, HMR-safe dispose against real API)
presets/youcom-research/
  preset.yml          — Display name, description, order
  agent.cordis.yml    — Persona + tool-web (research agent, no shell/fs tools)
cordis.patch.yml      — Bundle patch: inserts `id: youcom` row with YDC_API_KEY config
package.json          — npm metadata, dsh.bundle.patch, exports, files
tsconfig.json         — strict, es2022, NodeNext, noUncheckedIndexedAccess
```

## Architecture decisions

### API key resolution → `launchEnvironmentOf(ctx)`
Uses `@deepseek-ai/dsh-launch-environment` (peer dep, `^0.1.5-alpha.2`). Resolves
`YDC_API_KEY` across three dsh environment layers: `process` → project `.env` →
user `.env`. Matches the Exa provider's pattern. Falls back to `process.env` when
no launch snapshot exists. Config `apiKey` wins over env when both are provided.

### Error handling — 11 failure paths, 5 error body shapes
Every error is a `WebError` with a routable code:
- `WEB_ABORTED` — cancellation (3 points: fetch call, error body read, success body read)
- `WEB_PROVIDER_ERROR` — everything else (network, HTTP 4xx/5xx, unparseable bodies)

Error extraction handles 5 shapes confirmed live (commit `66bcc14`):
`{detail: string}`, `{error: string}`, `{message: string}`, `{detail: [{msg}]}`,
`{errors: [{title}]}`. Non-JSON error bodies fall back to HTTP status-line message.

### No timeout at provider level
The harness owns timeout policy (`dsh-tool-call-timeout-policy`, `dsh-tool-web`
sets `searchTimeoutMs: 60000`). Provider receives `AbortSignal` from caller.

### Wire types are snake_case
Confirmed live: the raw API response uses `page_age` (not `pageAge`). The
TypeScript SDK's docs show camelCase because the SDK renames fields
post-deserialization. We parse raw responses with no SDK layer — `src/types.ts`
matches actual wire casing.

### Content and truncation
- `content` is omitted from search results — You.com returns no generated answer
- `truncated: false` — the seam enforces `maxResults` truncation, not the provider
- Fetch `statusCode: 200` — `/v1/contents` retrieves server-side and reports no origin HTTP status

### X-Client-Info header
Format: `sdk; client=dsh-plugin-youcom/0.1.0; ua=node/v26.7.0`
Matches the Python SDK's `build_client_info_header` grammar (confirmed against
`youdotcom-python-sdk/tests/test_attribution.py`).

### Bundle auto-discovery
`dsh.bundle.patch: "./cordis.patch.yml"` in `package.json` — matches upstream
`@deepseek-ai/dsh-base` convention. Verified in real harness: `dsh --profile
headless --patch ... --dump-config` shows `# == @youdotcom-oss/dsh-plugin-youcom`
section with `id: youcom` row auto-discovered.

## Verification results

| Check | Result |
|-------|--------|
| Typecheck (`tsc --noEmit`, strict) | Clean |
| Unit tests (vitest) | 47/47 pass |
| Live smoke (real `YDC_API_KEY`) | 3/3 pass: search → citeable sources, fetch → markdown, dispose → gone |
| Harness integration (`dsh --dump-config`) | Plugin auto-discovered, `id: youcom` row present |
| npm pack dry-run | 20 files, 12KB |
| npm name availability | Confirmed |

## Known limitations (from README)

- `PLUGIN_VERSION` is hand-maintained in `src/index.ts` — bump with `package.json` version
- Hardcoded `https://ydc-index.io` base URL — override via `config.baseURL`
- Fetch `statusCode` is always 200 (server-side retrieval hides origin status)
- Fetch `truncated` is always false (endpoint documents no truncation signal)

## Remaining steps

1. `npm publish --access public` (from repo root)
2. Close Linear DX-736
3. Optionally: join DSH Discord, announce in community
4. `dsh-external/hub` from the Linear issue does not exist — `dsh-plugin` GitHub topic is the discovery mechanism

## For the auditor: things to verify

- [ ] `src/index.ts:apply()` — `launchEnvironmentOf(ctx).get('YDC_API_KEY')?.value` matches Exa pattern
- [ ] `src/search-provider.ts` — all three error catch blocks handle `WEB_ABORTED` before `WEB_PROVIDER_ERROR`
- [ ] `src/fetch-provider.ts` — `error instanceof WebError` re-throw before generic catch (line ~115)
- [ ] `src/error-message.ts` — 5 shapes in correct priority order
- [ ] `src/attribution.ts` — header format: `sdk; client=<name>/<version>; ua=node/<version>`
- [ ] `src/types.ts` — snake_case fields match live wire (confirmed in commit `66bcc14`)
- [ ] `cordis.patch.yml` — `name:` matches npm package name `@youdotcom-oss/dsh-plugin-youcom`
- [ ] `package.json` — `dsh.bundle.patch` points to `./cordis.patch.yml`
- [ ] `package.json` — `keywords` includes `dsh-plugin`
- [ ] `package.json` — `peerDependencies` includes `@deepseek-ai/dsh-launch-environment`
- [ ] `presets/youcom-research/agent.cordis.yml` — only `persona` + `tool-web`, no shell/fs
- [ ] `tsconfig.json` — strict, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`
- [ ] No references to Exa, Perplexity, or Brave in code (`grep -rni "exa\|perplexity\|brave" src/` should return empty)
- [ ] `npm run typecheck` passes
- [ ] `npm test` passes (50 tests)
- [ ] `YDC_API_KEY=<valid> npx vitest run tests/live-smoke.test.ts` passes (3 tests)