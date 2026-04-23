# vite-plugin-apitemkin — Development Plan

> Roadmap and design principles for **future** work. For shipped releases see [CHANGELOG.md](../CHANGELOG.md).

## 1. Vision & positioning

`vite-plugin-apitemkin` is a plug-and-play mock-API plugin for Vite. The name is a portmanteau of [Potemkin village](https://en.wikipedia.org/wiki/Potemkin_village) and *API* — a convincing facade where the real backend hasn't been built yet, or isn't reachable.

The plugin is deliberately narrow:

1. **Folder-based.** A `mocks/` directory is the API. Its layout maps directly to URLs.
2. **Plug-and-play.** Add the plugin, drop JSON files in `mocks/`, and they're served.
3. **Real HMR.** Adding, editing, or deleting a mock file updates the live dev server without a restart.
4. **Dev-only by construction.** Mocks never accidentally ship to production.
5. **TypeScript native.** Source is TypeScript; ships ESM + `.d.ts`.
6. **Zero runtime dependencies.** Built on Vite's connect server and Node built-ins.
7. **HTTP + JSON only at v1.** Streaming (WebSocket, SSE) is deliberately deferred to post-v1.0.

## 2. Why existing plugins fall short

| Plugin | Notable pain points |
| --- | --- |
| `vite-plugin-mock` (vbenjs) | HMR for mock files is unreliable; production-mode regressions; legacy `mockjs` dependency. |
| `vite-plugin-mock-dev-server` | WebSocket config conflicts with Vite's proxy; awkward shared-state story. |
| `msw` (Mock Service Worker) | Not Vite-native — requires service-worker plumbing in the browser; overkill for "just mock during dev." |
| `vite-plugin-fake-server` | Cannot use Node modules in mock files; deployment-to-prod story is unclear. |

Recurring themes: HMR breakage, file-based-routing boilerplate, dev/prod confusion, weak TypeScript ergonomics, dependency bloat. Streaming gaps are a *known* deferral here, not something `apitemkin` claims to solve.

## 3. Design principles

These rules govern all future work — additions or refinements that conflict with them need explicit reconsideration.

- **The folder convention is the API.** No required helper functions, no inline route declarations in `vite.config.ts`. Drop a file in `mocks/`, you get a route.
- **Filename suffix encodes method.** `users.get.json`, `users.post.ts`, `users.delete.mjs`. Suffix omitted defaults to GET. Same rule for `.json`, `.ts`, `.js`, `.mjs`.
- **`[param]` segments are dynamic.** Next/Nuxt-style. `mocks/users/[id].json` matches `GET /api/users/:id` for any single segment.
- **JSON files served verbatim.** File contents are the response body, sent with `Content-Type: application/json`. No wrapping, no metadata.
- **Code files invoked per request.** `.ts`/`.js`/`.mjs` files default-export either a handler `(req) => body | RichResponse` or a scenarios map `{ default, ...named }`. Loaded via Vite's SSR runtime; HMR-aware.
- **Vite middleware via `configureServer`.** Same port, no proxy, no separate dev server.
- **HMR via the dev-server watcher.** Listening on `add`/`change`/`unlink` events under the mocks dir; routes update without a page reload.
- **Dev-only by construction.** Plugin's `apply` is hardcoded to `'serve'`. Vite skips it entirely during build; no opt-in.
- **TypeScript native, ships `.d.ts`.** Authored in TS, built with **tsdown** (Rolldown-based) to ESM + declarations.
- **Zero runtime dependencies.** URL pattern matching, body parsing — all from Node built-ins.

### Folder convention rules

Two forms, mutually exclusive per resource:

1. **Flat file** when a resource has no sub-routes:
   - `mocks/healthcheck.json` → `GET /api/healthcheck`
   - `mocks/users.post.json` → `POST /api/users` (only if no `users/` folder exists)

2. **Folder + index** when a resource has children:
   - `mocks/users/index.json` → `GET /api/users`
   - `mocks/users/index.post.ts` → `POST /api/users`
   - `mocks/users/[id].ts` → `GET /api/users/:id`

Specifically:

- A file named `index.{method}?.<ext>` inside a folder uses the **folder's name** as the URL segment, not the literal "index".
- A file `X.{method}?.<ext>` and a folder named `X/` cannot be siblings. The scanner errors at scan time with a guided `mv` command.
- `index` is a reserved basename. A literal URL `/api/foo/index` cannot be expressed.
- `.json` and code files cannot map to the same URL+method. Pick one form per route.

## 4. Repository layout

Monorepo with `packages/*`:

- `packages/vite-plugin-apitemkin/` — the publishable plugin.
- `packages/playground/` — a Vite app that consumes the plugin via npm-workspaces symlink. Doubles as the executable showcase of the folder convention.

## 5. Roadmap

Released versions are documented in [CHANGELOG.md](../CHANGELOG.md). Future:

| Version | Status | Theme |
| --- | --- | --- |
| `1.0.0` | next | API freeze, semver guarantees, full docs, Node engine bump |
| `1.1.0` | post-1.0 | Devtools overlay UI for scenario switching |
| post-1.0 | maybe | Catch-all params (`[...slug]`), WebSocket/SSE support |

## 6. v1.0 — API freeze

**Acceptance criteria** for cutting v1.0:

- **Public API audit.** Confirm exported surface is the one we want to commit to:
  - `apitemkin(options)` plugin factory
  - `defineMock<T>(handler | scenariosMap)` helper (both overloads)
  - `scanMocks`, `matchRoute` low-level helpers (kept exported for tooling/debugging)
  - Types: `ApitemkinOptions`, `ApitemkinRequest`, `ApitemkinHandler`, `RichResponse`, `ScenarioValue`, `ScenariosMap`, `ScenariosHandler`, `MockRoute`, `MockRouteKind`, `PathSegment`, `HttpMethod`, `MatchResult`
  - Discovery endpoint at `GET /_apitemkin/scenarios`
- **Bump Node engine to `>=20`.** Node 18 reaches end-of-life Apr 2025; Node 20 is the current LTS. Update `engines.node` in `packages/vite-plugin-apitemkin/package.json`.
- **Vite peer dep stays at `^5 || ^6 || ^7`.** No current code path requires Vite 6+ APIs. Revisit only when a specific need arises.
- **Docs pass.** README is comprehensive (current state is close); CHANGELOG covers all releases; consider a `docs/recipes.md` cookbook for common patterns (auth-protected mock, paginated mock, file-upload mock, etc.).
- **Semver commitment.** From v1.0 onward, breaking changes require a major bump. New features = minor; bug fixes = patch.

**Not gated on v1.0** (could ship before or after):
- GitHub Actions CI for typecheck + test on push/PR
- HMR test timeout bump (the polled tests occasionally time out on slow CI)
- CONTRIBUTING.md (small, mostly redirects to DEVELOPMENT.md)

## 7. v1.1.0 — Devtools overlay (first post-1.0 improvement)

A browser-injected UI to toggle scenarios visually without editing URLs or fetch wrappers.

**Scope (minimum):**
- Per-route scenario picker, sourced from `/_apitemkin/scenarios`.
- Active selections persisted via cookie; plugin reads cookie per request and dispatches accordingly.
- Always-visible corner badge that expands into the picker on click. Dev-only — never injected during build.
- Style isolation via shadow DOM (custom element pattern).

**Should-have:**
- Recent-requests log (last N matched requests with method/URL/status/scenario-served).
- Status badge color shift when any non-default scenario is active.
- Global scenario shortcut: pick one name (e.g. `error`) that any route with that name uses.

**State channel:** cookie + a small `POST /_apitemkin/scenario` endpoint to set the active selection from the overlay. REST is sufficient; no WebSocket needed for human-speed clicks.

**Why post-1.0:** building UI on top of a still-moving API is wasteful. Stabilize the surface first, decorate after.

## 8. Out of scope (deliberate omissions)

These will not be added before v1.0; some may be reconsidered post-1.0 if real demand materializes.

- **Catch-all params** (`[...slug].get.json`, Next-style). Useful for proxy-style mocks, but additive — can land post-1.0 without a breaking change.
- **WebSocket and SSE streaming.** Out of scope for v1; possibly post-1.0.
- **OpenAPI ingestion.** Better as a separate add-on package if ever.
- **GraphQL helpers.** Different mental model; out of scope.
- **Response recording / replay.** Different problem space; out of scope.
- **Latency / failure-rate knobs beyond the existing `delay`.** Per-route `RichResponse.delay` covers the common case; broader simulation belongs in a different tool.

## 9. Resolved decisions (formerly open questions)

| Question | Resolution | Reasoning |
| --- | --- | --- |
| npm package name | `vite-plugin-apitemkin` (unscoped) | Already published; locked by reality. |
| Vite peer dep range | `^5 \|\| ^6 \|\| ^7` | Plugin uses no Vite-6-only APIs. Drop 5 only when a specific need arises. |
| Node engine floor | `>=18` until v1.0; bump to `>=20` at v1.0 | Node 18 EOL is Apr 2025; Node 20 is current LTS. Bumping at v1.0 is a clean cutover. |
| Catch-all `[...slug]` convention | Deferred to post-1.0 | Additive feature; not v1.0-blocking. |
