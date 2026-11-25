# vite-plugin-apitemkin: Development Plan (post-1.2)

Written 2026-11-21. It replaces the original plan, which was deleted in the v1.0 commit. That plan can be recovered with `git show 1fd9985^:docs/development-plan.md`, and everything it scheduled has shipped. Product context lives in [`PRODUCT.md`](../PRODUCT.md); the current visual baseline is in [`DESIGN.md`](../DESIGN.md).

## 1. Intent

apitemkin should be the **lightweight, easy, simple option for anyone who uses Vite and needs mock data**.

The scope stays Vite-only on purpose. The goal is to avoid getting lost in building many implementations. The engine does get separated from the Vite plugin now, so other adapters stay possible later without a rewrite.

### Why people don't use it today (working hypotheses)

The owner's guesses:
- They don't know the plugin exists.
- They don't have data.
- Creating mocks is tedious.
- They can't easily import existing data.

Observations from the code:
- Unmatched URLs under the prefix return a 404, so it's all or nothing on an existing project.
- Mocks are stateless: a POST never changes what the next GET returns.

Owner's own experience: to make mocks "a bit more dynamic," they had to use AI to write them.

### Success

- An AI assistant writes correct apitemkin mocks on the first try.
- Someone with an existing backend can mock one endpoint and keep the rest real.
- Generating 50 realistic records takes one line, not 50 hand-written objects.
- A create/edit/delete screen can be built against mocks that behave like a real backend (after 1.5).

## 2. Goals, non-goals, anti-goals

**Goals**
- Make starting easier: AI-friendly docs, partial adoption, less typing.
- Replace the overlay's generic look with a deliberate design.
- Add mocks that remember changes (collections).
- Keep the engine separable from Vite.

**Non-goals (for this plan)**
- Support for other bundlers, a standalone CLI, or test-runner adapters.
- A docs or landing site (listed under "later").
- Import from HAR, OpenAPI or recorded traffic (listed under "later").
- WebSocket, SSE, catch-all params (listed under "later").

**Anti-goals: failure even if it technically works**
- **Becoming Mirage or MSW.** No ORM, no relationships between collections, no schema language.
- **A new syntax to learn.** No Mock.js-style template mini-language (`'list|1-10'`, `@name`). TypeScript already does the job.
- **Runtime dependencies.** Faker is not bundled or required.
- **Anything reaching the production build.**
- **Breaking the v1 API.** Every release here is additive (a minor version). New behavior that would change existing results is opt-in.
- **Required configuration.** Zero-config usage must keep working exactly as it does now.

## 3. Constraints

From `PRODUCT.md` and the codebase:
- Vite `^7`, Node `>=20`, plugin is `apply: 'serve'`.
- Zero runtime dependencies.
- v1 API frozen under SemVer. *My call on what counts as frozen:*
  - **Every current export.** That includes the ones the README doesn't document: `scanMocks`, `matchRoute`, `MockRoute`, `MockRouteKind`, `MatchResult` and `PathSegment`.
  - **The discovery endpoint's response shape.**
  - **What doesn't count as breaking:** adding a new value to a union such as `MockRouteKind` or the discovery `kind`. It's additive and gets called out in the CHANGELOG.
- The overlay renders in a closed shadow root, follows the OS color scheme unless the user picks a theme in the panel, loads nothing from the network, and fits a JS+CSS budget of 150 kB minified or less (raised from 15 kB on 2026-11-22 for the 1.4 redesign).
- The file system is the only route spec; no second place declares routes.
- Errors name the files involved and the exact fix.

## 4. Approaches considered

### Populating data

Research covered json-server, Mock.js / vite-plugin-mock, Mockoon, Mirage JS and `@mswjs/data`. They use four patterns:

1. **Hand-written files** (json-server `db.json`, apitemkin today).
2. **A script that generates data** (json-server accepts a JS file whose function returns the data, usually built with Faker).
3. **A template mini-language** (Mock.js `'list|1-10'` + `@name`; Mockoon Handlebars `{{faker …}}` inside `{{#repeat}}`).
4. **Factories:** describe one record, ask for N (Mirage `createList`, `@mswjs/data` `factory`).

Almost all of them take the random values from Faker. The tools with factories (Mirage, `@mswjs/data`, Mockoon) also pair the data with CRUD routes that remember changes.

**Chosen:** a tiny factory helper (`many()`) plus bring-your-own Faker, then collections in 1.5.
- **Rejected: the template language.** It's new syntax, against "simple."
- **Rejected: bundled Faker.** It breaks zero dependencies for something users can add with one import.
- **Rejected: full factory/ORM APIs.** Too heavy.

### Separating the engine

- **A. A second npm package now** (`apitemkin-core` + plugin). This is the cleanest seam, but it means two packages to publish and version before a second consumer exists.
- **B. An internal `core/` boundary inside the one package.** It can't import Vite, the public API is unchanged, and it's published as a separate package only when a second adapter exists. **Chosen.**
- **C. No separation.** Rejected: the owner wants the seam now, and collections should be built engine-side from the start.

### Order

The first proposal put collections before the overlay. **The owner chose:** easier to start → new overlay → mocks that remember. Consequence: the 1.4 overlay must leave room for a third route kind, and 1.5 adds a small control rather than reworking the overlay.

## 5. Releases

Each release gets its own short design before implementation. The sections below record what is decided; anything marked *open* is settled in that release's design.

### 1.3: Easier to start

**a) Engine split (internal, no user-facing change)**
- Move scanning, matching, request parsing and response normalization into `src/core/`. Code in `src/core/` must not import from `vite`, including type imports.
- Three things are Vite-specific and stay in the adapter (`src/index.ts`): file watching (`server.watcher`), mounting middleware (`server.middlewares`), and loading code mocks (`server.ssrLoadModule`). Core receives module loading as an injected function. Today `runtime.ts` imports the `ViteDevServer` type; that dependency must go.
- Public exports and behavior stay identical. The existing test suite must pass unchanged. Re-export shims at the old paths (`src/scanner.ts`, etc.) are fine.
- *My call:* the core is Node-shaped. It may use `IncomingMessage` / `ServerResponse` and `node:fs`. Every adapter in view (Vite now; a CLI or test helper later) runs in Node, and no browser or service-worker adapter is planned. A Fetch-standard core would make 1.3 much bigger for no current benefit.
- Enforcement is left to the builder (a test that greps `src/core/` for `vite` imports is enough).

**e) Bug fix: adding or deleting code mocks isn't picked up**
- The watcher (`handleChange` in `src/index.ts`) only rescans on `.json` events. Adding or deleting a `.ts` / `.js` / `.mjs` mock doesn't change the route table until a restart, which contradicts the README's "changes apply without restarting." Editing an existing code mock does work, because Vite reloads the module.
- Fix it so add and unlink events for every supported extension trigger a rescan, and extend `test/hmr.test.ts` to cover code mocks. This is a behavior change, so it ships as its own bug-fix commit, separate from the refactor in (a). 1.5 depends on it, since collections reset on file change.

**b) AI guide (E)**
- A plain-text guide for AI assistants that explains how to write apitemkin mocks: the folder rules, method suffixes, params, `index` files, JSON vs code mocks, `defineMock` (handler and scenarios forms), `defineOverride`, `many()`, and the common errors (file/folder siblings, a JSON and a code mock for the same route).
- Ships inside the npm package, so it's readable from `node_modules/vite-plugin-apitemkin/`. It's also linked from the README.
- *My call:* name it `llms.txt` at the package root and add it to `files`. *Open:* also provide an `AGENTS.md`-style snippet users can paste into their own repo.
- The guide's code examples must stay correct. The builder chooses how, for example by typechecking them in CI.

**c) Fall-through for unmatched URLs**
- A new option, off by default, so existing behavior is unchanged. When it's on, a request under `urlPrefix` that matches no mock is passed on (`next()`) instead of getting the JSON 404, so Vite's `server.proxy` can forward it to a real backend.
- *My call:* name it `fallthrough: boolean`.
- *Open:* what happens when fall-through is on and no proxy is configured. Vite would serve its SPA HTML. Options include a one-time terminal warning, and the 1.3 design picks one.
- The builder must verify that plugin middleware runs before Vite's proxy middleware, so `next()` actually reaches the proxy.

**d) `many()` helper**
- `many<T>(count: number, make: (index: number) => T): T[]`, exported from the main entry. The index is 0-based. It's identity-simple, a few lines, with no dependencies.
- The README gets a recipe for realistic values: install `@faker-js/faker` yourself, import it in a `.ts` mock, and call `faker.seed(n)` so data stays stable across reloads.

**Done when:** tests pass, README and CHANGELOG are updated, the AI guide ships in the packed tarball (`npm pack --dry-run`), and the overlay bundle is unaffected.

### 1.4: New overlay

- A full visual redesign through the Impeccable workflow (new-work), which replaces `DESIGN.md`. The current look is documented there as a baseline and anti-reference.
- **Keep:** current features (route list, method, URL, per-route scenario picker, refresh, reset all, active-override count), all overlay constraints from §3, and the persistence and fetch/XHR patching behavior.
- **Fix:** the invalid `font: … inherit` shorthands. They disappear in the rewrite.
- **Must:** leave room for a third route kind (`collection`, arriving in 1.5) next to `json` and `code`. 1.5 should only need to add a "reset data" control and a kind indicator.
- *My call, pulled forward from 1.5 so the overlay can plan for it:* a collection appears as **one entry** in discovery and **one row** in the overlay, even though it serves several operations across two URLs. The row shows the collection's base URL and a kind indicator, and it has room for a "reset data" control. Whether collections support scenarios stays open (see 1.5). The row must work both with a scenario picker and without one, as JSON rows already do with "—".
- **Approval:** the owner picks the visual direction and approves it before any build, through the Impeccable flow. Nothing in 1.4 is implemented on an unapproved direction.
- *Open:* whether the playground page is restyled in the same release, and whether the overlay gains any new features. Both are settled in 1.4's design.

**Done when:** it's redesigned, verified in light and dark at real sizes, within the bundle budget, and `DESIGN.md` reflects the shipped result.

### 1.5: Mocks that remember (collections)

Shipped. Its design doc and implementation plan were removed after release; the README, `llms.txt` and CHANGELOG describe the result, and the summary below records what changed from this plan.

What changed, and why: this plan had a collection as one mock file that serves every CRUD route. During design the owner rejected that because it declares routes in code, against §3's "the file system is the only route spec." Instead, a collection is **data**: a folder's `_data.ts` file with `defineCollection(seed)`. The endpoints stay ordinary route files that import it, using one-liners (`users.create()`) or direct access (`users.insert(...)`). So:
- **No new route kind.** Collections are reported through their own dev endpoint (`/_apitemkin/collections`), not as `collection` entries in discovery, so the 1.4 "third kind" room goes unused.
- **The overlay** shows a collection line (count + Reset) at the top of its folder group.
- **The open questions are settled in the spec:** file naming, the sibling rule, interaction with mock files (no conflict, since routes are always files), filtering and paging (not built in), the id strategy, and scenarios (through `defineMock`, unchanged).

Still true from the original plan: seeds can come from `many()`; state is in memory only, never on disk; there are no relationships between collections; it depends on the 1.3 watcher fix.

### 2.0 (unscheduled)

- Remove the deprecated `apitemkin_scenario` param.

### Later (maybe, not scheduled)

- Docs or landing site.
- Import from HAR, OpenAPI or recorded responses.
- Catch-all params (`[...slug]`).
- WebSocket / SSE.
- Publishing `core/` as its own package, once a second adapter exists.

## 6. Housekeeping

When this plan is approved, update the Roadmap table in `README.md` and the roadmap line in `PRODUCT.md` (Capabilities and Constraints) to match §5.
