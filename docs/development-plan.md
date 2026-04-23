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
- **TypeScript native, ships `.d.ts`.** Authored in TS, built with tsdown (Rolldown-based) to ESM + declarations.
- **Zero runtime dependencies.** URL pattern matching, body parsing — all from Node built-ins or tiny in-repo utilities.

### Folder convention rules

Two forms, mutually exclusive per resource:

1. **Flat file** when a resource has no sub-routes:
   - `mocks/healthcheck.json` → `GET /api/healthcheck`
   - `mocks/users.post.json` → `POST /api/users` (only if no `users/` folder exists)

2. **Folder + index** when a resource has children:
   - `mocks/users/index.json` → `GET /api/users`
   - `mocks/users/index.post.json` → `POST /api/users`
   - `mocks/users/[id].json` → `GET /api/users/:id`

Specifically:

- A file named `index.{method}?.json` inside a folder uses the **folder's name** as the URL segment, not the literal "index".
- A file `X.{method}?.json` and a folder named `X/` cannot be siblings. The scanner errors at scan time with a guided `mv` command pointing to the consolidated form.
- `index` is reserved as a basename. A literal URL `/api/foo/index` cannot be expressed.
- A folder without an `index.json` is fine — the URL prefix simply has no own response, only children.

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
- `index.{method}?.json` inside a folder uses the folder name as the URL segment.
- File/folder name collision is rejected at scan time with a guided migration message.
- JSON files only. File contents = response body, served as `application/json`.
- HMR re-scans on add/edit/delete of any file under the mocks root.
- Dev-only enforced; loud warning if invoked at build time.
- Configurable URL prefix (default: `/api`).
- Vitest coverage including end-to-end tests against a real Vite dev server (using the playground or an inline fixture).

## 6. v0.2 — Dynamic callback responses (shipped)

Same folder convention, but `.ts` / `.js` / `.mjs` files alongside `.json`.

- Default export is a handler: `(req) => body | { status?, headers?, body, delay? } | Promise<...>`.
- Handler receives a typed request context: `method`, `url`, `params`, `query`, `body`, `headers`.
- `defineMock<T>(handler)` helper for type inference; identity at runtime.
- New `delay` plugin option (default 150ms) simulates real network latency. Per-route override via `RichResponse.delay`.
- Request body parsed automatically when `Content-Type: application/json`. Other content types leave `body` as `undefined`.
- Loaded via Vite's `server.ssrLoadModule` — free TypeScript support, automatic HMR on file change.
- String returns become `text/plain`; `Buffer` returns are sent verbatim; everything else is `JSON.stringify`'d. Override `Content-Type` via the rich-response `headers`.
- `.json` and code files coexist freely; collision on the same URL+method is rejected at scan time with a guided error message.
- Thrown errors become `500 { error: <message> }` JSON.

## 7. v0.3 — Scenarios (shipped)

Named response variants for code mocks. JSON files stay as fixed responses; scenarios are exclusively a code-mock feature exposed via the `defineScenarios()` helper:

```ts
import { defineScenarios } from 'vite-plugin-apitemkin';

export default defineScenarios({
  default: [{ id: 1 }],
  empty:   [],
  error:   { status: 500, body: { error: 'oops' } },
  slow:    { delay: 2000, body: [{ id: 1 }] },
  computed: ({ params }) => ({ id: Number(params.id) }),
});
```

- Each variant value can be a plain body, a `RichResponse` (`{ status?, headers?, body, delay? }`), or a handler function. Same normalization rules as plain `defineMock`.
- The `default` key is TS-required; other names are user-defined.
- Activate per request via `?apitemkin_scenario=<name>`. The query param is consumed by the plugin and stripped from `req.query` before the handler sees it.
- `req.scenario` is also exposed on `ApitemkinRequest` for plain `defineMock` handlers that want to branch manually.
- Unknown scenario name → silent fallback to `default` + a `console.warn` from the dev server.
- Discovery: `GET /_apitemkin/scenarios` returns a JSON list of every route with its kind (`'json' | 'code'`) and available scenario names.

Why this shape over filename conventions: JSON files stay simple (no new grammar to learn); all variants for a route co-locate in one file; `defineScenarios` composes with v0.2's normalization so users learn one mental model.

## 8. v0.4 — Devtools overlay (next)

A small browser-injected UI to toggle scenarios visually, removing the need to manually edit URLs or fetch wrappers during demos and bug-repros. Reads from the v0.3 discovery endpoint to populate the menu; writes the active scenario to a cookie or localStorage; reads it on each request via the existing query-param plumbing (or a parallel cookie-extraction path).

## 9. Out of scope (v1.0 and earlier)

- WebSocket and SSE streaming.
- OpenAPI ingestion.
- GraphQL.
- Response recording.
- Latency / failure simulation knobs.

These may be reconsidered post-v1.0 if there's real demand. They are deliberate omissions, not oversights.

## 10. Milestones

| Version | Status | Theme |
| --- | --- | --- |
| `0.0.1` | done | Scaffold (JS + JSDoc, single package; superseded by 0.0.2) |
| `0.0.2` | done | Restructure: monorepo + TS + tsdown + playground |
| `0.1.0` | shipped | Folder-based JSON mocks with HMR |
| `0.2.0` | shipped | Dynamic JS/TS callback responses with `defineMock` |
| `0.3.0` | in branch | Scenarios via `defineScenarios` + discovery endpoint |
| `0.4.0` | next | Devtools overlay UI for scenario switching |
| `1.0.0` | planned | API freeze, semver guarantees, full README/recipes |
| post-1.0 | maybe | WebSocket and SSE support, if demand materializes |

## 11. Open questions

- **Catch-all convention.** `[...slug].get.json` (Next-style)?
- **npm package name.** `vite-plugin-apitemkin` (unscoped) or `@opavsky/vite-plugin-apitemkin`?
- **Vite version floor.** Keep `^5 || ^6 || ^7` or drop 5 to simplify HMR work?
- **Node version floor.** `>=18` or `>=20`?
