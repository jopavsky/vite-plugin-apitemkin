# vite-plugin-apitemkin — Development Plan

## 1. Vision & positioning

`vite-plugin-apitemkin` is a plug-and-play mock-API plugin for Vite. The name is a portmanteau of [Potemkin village](https://en.wikipedia.org/wiki/Potemkin_village) and *API* — a convincing facade where the real backend hasn't been built yet, or isn't reachable.

The plugin is deliberately narrow:

1. **Folder-based.** A `mocks/` directory is the API. Its layout maps directly to URLs.
2. **Plug-and-play.** Add the plugin, drop JSON files in `mocks/`, and they're served.
3. **Real HMR.** Adding, editing, or deleting a mock file updates the live dev server without a full reload.
4. **Dev-only by default.** Mocks never accidentally ship to production.
5. **TypeScript native.** Source is TypeScript; ships ESM + `.d.ts`.
6. **Zero runtime dependencies.** Built on Vite's connect server and Node built-ins.
7. **HTTP + JSON only at v1.** Streaming (WebSocket, SSE) is deliberately deferred to post-v1.0.

## 2. Why existing plugins fall short

| Plugin | Notable pain points |
| --- | --- |
| `vite-plugin-mock` (vbenjs) | HMR for mock files is unreliable; production-mode regressions; legacy `mockjs` dependency. |
| `vite-plugin-mock-dev-server` | WebSocket config conflicts with Vite's proxy; awkward shared-state story; smaller ecosystem. |
| `msw` (Mock Service Worker) | Not Vite-native — requires service-worker plumbing in the browser; overkill for "just mock during dev." |
| `vite-plugin-fake-server` | Cannot use Node modules in mock files; deployment-to-prod story is unclear. |

Recurring themes: HMR breakage, file-based-routing boilerplate, dev/prod confusion, weak TypeScript ergonomics, dependency bloat.

Streaming gaps in some of these plugins are a *known* deferral here, not something `apitemkin` claims to solve. If you need WebSocket or SSE mocks, use a different tool until post-v1.0.

## 3. Design principles

- **The folder convention is the API.** No required helper functions. No inline route declarations in `vite.config.ts`. Drop a file in `mocks/`, you get a route.
- **Filename suffix encodes method.** `users.get.json`, `users.post.json`, `users.delete.json`. Suffix omitted defaults to GET, so `users.json` ≡ `users.get.json`.
- **`[param]` segments are dynamic.** Next/Nuxt-style. `mocks/users/[id].json` matches `GET /users/:id` for any single segment value.
- **JSON files served verbatim.** File contents are the response body, sent with `Content-Type: application/json`. No wrapping, no metadata schema.
- **Vite middleware via `configureServer`.** Same port, no proxy, no separate dev server.
- **HMR via `handleHotUpdate`.** Watching the mocks dir; add/edit/delete a file → routes update without a page reload.
- **Dev-only enforced.** Plugin's `apply` defaults to `'serve'`. Loud warning if used during build.
- **TypeScript native, ships `.d.ts`.** Authored in TS, built with tsup to ESM + declarations.
- **Zero runtime dependencies.** URL pattern matching, body parsing — all from Node built-ins or tiny in-repo utilities.

## 4. Repository layout

Monorepo with `packages/*`.

- `packages/vite-plugin-apitemkin/` — the publishable plugin.
- `packages/playground/` — a Vite app that consumes the plugin via npm-workspaces symlink. Doubles as the executable showcase of the folder convention.

The playground is both a development-feedback loop and the canonical example of how the folder layout maps to routes.

## 5. MVP scope (v0.1)

The smallest thing a user can drop in and find genuinely useful.

- Folder scanner reads a configurable `mocks/` root.
- Filename suffix → method; default GET.
- `[id]`-style segments → dynamic single-segment params.
- JSON files only. File contents = response body, served as `application/json`.
- HMR re-scans on add/edit/delete of any file under the mocks root.
- Dev-only enforced; loud warning if invoked at build time.
- Configurable URL prefix (default: none — `mocks/users.json` → `GET /users`).
- Vitest coverage including end-to-end tests against a real Vite dev server (using the playground or an inline fixture).

## 6. v0.2 — Dynamic callback responses

Same folder convention, but `.ts` / `.js` / `.mjs` files alongside `.json`.

- Default export is a handler: `(req, params) => unknown | Promise<unknown>`.
- Request body parsed (JSON + form) before being passed in.
- Type-safe via exported types from the plugin package.
- `.json` and code files coexist. Code files take precedence on path collision (and warn).
- Enables dynamic responses based on request data — query params, body, headers.

## 7. Out of scope (v1.0 and earlier)

- WebSocket and SSE streaming.
- OpenAPI ingestion.
- GraphQL.
- Response recording.
- Latency / failure simulation knobs.

These may be reconsidered post-v1.0 if there's real demand. They are deliberate omissions, not oversights.

## 8. Milestones

| Version  | Theme                                   | Acceptance criteria                                                                                |
| -------- | --------------------------------------- | -------------------------------------------------------------------------------------------------- |
| `0.0.1`  | Scaffold (JS + JSDoc, single package)   | Done. Will be superseded by `0.0.2` before any tag is published.                                   |
| `0.0.2`  | Restructure: monorepo + TS + playground | Empty TS plugin, tsup build, playground workspace, smoke test, CI-ready scripts.                   |
| `0.1.0`  | MVP folder-based JSON mocks             | Folder scanner, method suffix, `[id]` params, HMR, dev-only, >=80% coverage, playground demoing it. |
| `0.2.0`  | Dynamic JS/TS callback responses        | Code files alongside JSON files, request body parsing, exported types for handler signatures.      |
| `1.0.0`  | Stable API + docs                       | API freeze, semver guarantees, full README/recipes, no breaking changes planned.                   |
| post-1.0 | Maybe streaming                         | WebSocket and SSE support reconsidered based on real demand.                                       |

## 9. Open questions

- **Default URL prefix.** No prefix (`mocks/users.json` → `/users`) or opinionated default `/api`?
- **Catch-all convention.** `[...slug].get.json` (Next-style)?
- **Conflict resolution.** If both `users.json` and `users.get.json` exist, which wins? Suggested: error loudly.
- **npm package name.** `vite-plugin-apitemkin` (unscoped) or `@opavsky/vite-plugin-apitemkin`?
- **Vite version floor.** Keep `^5 || ^6 || ^7` or drop 5 to simplify HMR work?
- **Node version floor.** `>=18` or `>=20`?
