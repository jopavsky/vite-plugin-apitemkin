# Changelog

All notable changes to `vite-plugin-apitemkin` are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- `defineOverride(base, patch)` helper for authoring partial scenario
  variants. Returns a deep-merged copy of `base` with `patch` applied.
  Plain objects merge recursively; arrays, `null`, primitives, and class
  instances replace wholesale; `undefined` patch values preserve the
  base; inputs are never mutated. Pairs with the existing
  `defineMock(scenariosMap)` form — the helper produces a plain `T`, so
  the dispatcher and discovery endpoint are untouched. For shallow
  merges, native `{ ...base, ...patch }` remains the right tool; reach
  for `defineOverride` when nesting is involved. For status/header
  variants, wrap explicitly: `{ status: 500, body: defineOverride(base, patch) }`.
- `DeepPartial<T>` type export for typing custom override helpers
  downstream.

## [1.0.0] — 2026-04-23

First stable release. API is now frozen under SemVer: breaking changes
require a major bump; new features land as minors; bug fixes as patches.

### Changed
- **Vite peer dependency narrowed to `^7.0.0`.** Previously `^5 || ^6 || ^7`,
  but only Vite 7 was actually covered by the test suite. Narrowing to the
  version we verify makes the compatibility claim honest. Projects on Vite
  5 or 6 should upgrade Vite (the plugin is dev-only, so the upgrade cost
  is minimal).
- **Node engine bumped to `>=20`.** Node 18 reaches end-of-life in April
  2025; Node 20 is the current LTS. Vite 7 itself requires `>=20`, so this
  matches the peer dep stack.

### Note
- No changes to the public API surface. Everything exported in 0.3.0
  remains exported in 1.0.0 with identical shape. The only breakage is
  the peer-dep range — users already on Vite 7 + Node 20 upgrade with no
  code changes.

## [0.3.0] — 2026-04-23

### Added
- `defineMock<T>(scenarios)` overload for code mocks with multiple named
  response variants. Pass a `{ default, [name]: ... }` object instead of
  a handler function; each variant can be a plain body, a `RichResponse`,
  or an `ApitemkinHandler` function. The `default` key is required.
- `?apitemkin_scenario=<name>` query parameter selects the active scenario
  per request. Consumed entirely by `defineMock(scenariosMap)` and stripped
  from `req.query`, so plain handler-form mocks never see it.
- `GET /_apitemkin/scenarios` discovery endpoint returns every route with
  its `method`, `url`, `kind` (`'json' | 'code'`), and available scenario
  names. JSON routes always show empty scenarios.
- New exported types: `ScenarioValue<T>`, `ScenariosMap<T>`, `ScenariosHandler<T>`.

### Changed
- `defineMock` now accepts either a handler function (existing v0.2 form)
  or a scenarios map (new). TypeScript overload resolution picks the
  right return type. There is no separate `defineScenarios` helper; the
  unified API keeps the surface tight.
- Unknown scenarios silently fall back to `default` with a console warning
  (rather than 404'ing) — friendlier for demos and quick toggles.

## [0.2.0] — 2026-04-23

### Added
- Dynamic JS/TS/MJS callback responses: drop a `.ts`, `.js`, or `.mjs` file in `mocks/`
  with a default-exported handler `(req) => body | { status?, headers?, body, delay? }`.
- `defineMock<T>(handler)` helper for full type inference on response and request shape.
- Exported handler types: `ApitemkinHandler<T>`, `ApitemkinRequest<T>`, `RichResponse<T>`.
- Automatic JSON request body parsing (when `Content-Type: application/json`); `body` is
  passed to the handler pre-parsed.
- Sample dynamic mocks in the playground: `whoami.ts`, `echo.post.ts`, `users/[id].ts`.
- New `MockRouteKind` (`'json' | 'code'`) field on `MockRoute` so tooling can introspect
  whether a route is a static file or a handler.
- New `delay` plugin option — global artificial latency in ms before each response.
  Default `150`. Pass `0` to disable.
- Per-route `delay` field on `RichResponse` — code mocks can override the global delay
  for a specific endpoint (useful for "slow this one endpoint" or "make this one instant").

### Changed
- Scanner discovers `.ts`/`.js`/`.mjs` files alongside `.json`. Same naming conventions
  apply uniformly: filename suffix → method, `[id]` → param, `index.{method}?.json|.ts`
  inside a folder uses the folder name, file/folder ambiguity check.
- JSON-vs-code collision on the same URL+method is detected at scan time with a
  "pick one form per route" hint.
- Playground's `users/[id].json` replaced with `users/[id].ts` to demonstrate the
  dynamic form.
- `dist/index.js` bundle: 8.01 kB → ~11.6 kB (added runtime + body parsing + helper).

### Fixed
- (none)

## [0.1.0] — 2026-04-23

### Added
- Initial release.
- Folder-based JSON mock serving: layout under `mocks/` maps to URLs.
- Filename suffix encodes HTTP method (`users.post.json` = POST).
- `[id]` segments capture as URL params.
- `index.{method}?.json` inside a folder uses the folder name as the URL segment.
- Sibling file/folder name collisions are rejected at scan time with a guided
  `mv` migration command.
- Dev-only by construction: hardcoded `apply: 'serve'`; no opt-in for build.
- Plugin owns the configured prefix: any unmatched URL under it returns a `404`
  JSON envelope rather than falling through to Vite's SPA HTML fallback.
- HMR: add, edit, or delete `.json` files at runtime; routes update without a
  dev-server restart.
- Configurable `mocksDir` and `urlPrefix`.
- Exported helpers: `scanMocks`, `matchRoute`, plus types `MockRoute`,
  `PathSegment`, `HttpMethod`, `MatchResult`.
- Zero runtime dependencies.

[Unreleased]: https://github.com/jopavsky/vite-plugin-apitemkin/compare/v1.0.0...HEAD
[1.0.0]: https://github.com/jopavsky/vite-plugin-apitemkin/compare/v0.3.0...v1.0.0
[0.3.0]: https://github.com/jopavsky/vite-plugin-apitemkin/compare/v0.2.0...v0.3.0
[0.2.0]: https://github.com/jopavsky/vite-plugin-apitemkin/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/jopavsky/vite-plugin-apitemkin/releases/tag/v0.1.0
