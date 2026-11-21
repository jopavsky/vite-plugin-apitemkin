# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Two primary jobs, weighted equally:

- **Building ahead of the backend.** Frontend developers on a Vite app whose API doesn't exist yet, is unstable, or is slow to change. They need real HTTP responses without running a backend.
- **Exercising UI states on demand.** Developers who need to trigger empty, error, slow and edge-case responses while building or reviewing UI, without editing code or URLs every time.

Both are developers working in a local dev loop: editor, terminal running `vite`, and the app open in a browser with DevTools.

## Product Purpose

`vite-plugin-apitemkin` is a dev-only Vite plugin that serves mock API responses from a `mocks/` folder. Drop in a file and its URL works. Code mocks compute responses from the request. Scenarios give one route several named variants, and the in-app dev-tools overlay switches between them without touching URLs.

Success means a developer adds one line to `vite.config.ts`, creates files, and gets a working API, then moves between UI states in seconds while the dev server keeps running.

## Positioning

**Vite-native mocks where the folder is the spec, with typed scenarios you can switch from inside your app.**

No single feature is unique. File-to-route mapping exists elsewhere: Mockaton, json-server-style tools and several small npm packages. What sets apitemkin apart is the combination:

1. **Inside the Vite dev server.** One line of config, `apply: 'serve'`, and nothing ships in the production build.
2. **The folder is the spec.** The file path sets the URL and the filename suffix sets the method. There is no route config and no `url` field.
3. **Typed scenarios in one file.** `defineMock(scenariosMap)` and `defineOverride(base, patch)` keep every variant of a route in a single `.ts` file.
4. **A switcher inside the app.** The overlay is injected into the developer's own page, with no browser extension and no separate dashboard. Responses are real HTTP, so curl and the Network tab see them too.

Neighbors, for reference (research from 2026-11-21, not a claim to repeat publicly):

- **Mockaton:** the closest. It has file-based routes, variants as separate files and a dashboard, but runs as a standalone server with its own page.
- **vite-plugin-mock-dev-server:** a Vite plugin, but each mock file declares its own `url`, and it hooks into `server.proxy`.
- **MSW:** service-worker interception with handlers written in code. Scenario switching comes from third-party extensions or UIs.

## Operating Context

- Runs inside `vite` dev (Vite `^7`, Node `>=20`). Mocks live in `mocks/` next to `vite.config.ts`, configurable through `mocksDir`. They're served under `urlPrefix`, which defaults to `/api`.
- Hot changes: adding, editing or deleting mock files applies without restarting the server.
- Developers verify mocks through the browser, the Network tab, curl, and the discovery endpoint `GET /_apitemkin/scenarios`.
- Surfaces future design work may touch:
  - **Dev-tools overlay** (`packages/vite-plugin-apitemkin/src/devtools/`): a bottom-right launcher plus a side panel with a per-route scenario picker, rendered inside other people's apps.
  - **Playground** (`packages/playground/`): a live dev app and the runnable example of the folder convention. It currently dumps probe results into a `<pre>`.
  - **Docs / landing site:** planned. It doesn't exist yet.
  - **Terminal and error output:** startup errors and warnings through Vite's logger, such as the ambiguous-layout error that prints the exact `mv` command to fix it.

## Capabilities and Constraints

- **Folder convention:** file path → URL; filename suffix → method (no suffix means GET); `[name]` → dynamic param; `index.{method}?.<ext>` takes the folder's name as its URL segment; literal segments beat params. A file `X.<ext>` and a folder `X/` can't be siblings.
- **Mock kinds:** `.json` (static, no scenarios) and `.ts` / `.js` / `.mjs` (handler or scenarios map). A route can't have both a JSON and a code mock for the same method.
- **Responses:** a plain body (JSON, status 200) or a rich response `{ status?, headers?, body, delay? }`. Strings become `text/plain` and Buffers are sent as-is. Thrown errors become `500 { error }`. A request under `urlPrefix` that matches nothing gets a JSON 404, never Vite's SPA HTML fallback.
- **Request bodies:** only JSON bodies are parsed.
- **Scenarios:** activated per request with `?apitemkin_scenario=<name>`. `default` is required. An unknown name falls back to `default` and logs a warning.
- **Overlay:** on by default; `devtools: false` turns it off. It patches `fetch` and `XMLHttpRequest.open` for same-origin matching routes only. A URL param beats the panel's selection. Selections are stored per tab in `localStorage` under `apitemkin:selections`, and stale ones are pruned silently. It renders in a closed shadow root so no CSS leaks either way. Bundle budget is ≤ 15 kB minified (shipped: 12.26 KB min, 4.28 KB gzip). It follows the host's `color-scheme` (light/dark).
- **Packaging:** no runtime dependencies. ESM plus `.d.ts`, built with tsdown. MIT license.
- **Stability:** v1 API is frozen under SemVer. Breaking changes need a major version.
- **Roadmap ("maybe," post-1.2):** catch-all params (`[...slug]`) and WebSocket/SSE support. Neither is committed.
- **Terminology:** mock, route, method suffix, param, code mock, scenario, rich response, override, discovery endpoint, dev-tools overlay, launcher, panel.

## Brand Commitments

- **Name:** `apitemkin`, always lowercase, a play on "Potemkin." Package name: `vite-plugin-apitemkin`.
- **Tagline:** "The Potemkin village for your API." It is binding.
- **Voice:** dry, playful wit is welcome wherever it fits. A Potemkin village is a convincing fake, and so is a mock API. The wit sits on top of precise, technical writing and never replaces it. Error messages stay exact and actionable first.
- **Copy habits seen in the README:** short declarative sentences; concrete commands and file paths over abstractions; rules stated as numbered conventions.
- No logo or other visual identity assets exist yet.

## Evidence on Hand

- `README.md`: full feature docs, folder convention and options table.
- `CHANGELOG.md`: release history 1.0.0 → 1.2.0, including the measured overlay bundle size.
- `packages/playground/mocks/`: real example mocks (JSON list, POST, param handler, echo, whoami, scenarios, overrides).
- The terminal error format for ambiguous layouts is documented in the README.
- **Absent:** download counts, GitHub stars, users, testimonials, case studies, benchmarks and press. Future work must not invent any of these.

## Product Principles

1. **The file system is the only spec.** Never add a second place where routes are declared.
2. **Dev-only, zero footprint.** Nothing reaches the production build, and the plugin adds no runtime dependencies.
3. **Be a polite guest in someone else's app.** The overlay is isolated, small and pass-through by default. Explicit developer intent, such as a URL param, always wins.
4. **Errors tell you the fix.** Failures name the files involved and give the exact command or change that resolves them.
5. **Claim only what is verified.** Compatibility and features match what the tests actually cover, as when the Vite peer range was narrowed to `^7`.
