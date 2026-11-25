# vite-plugin-apitemkin

Plug-and-play mock API plugin for Vite. The Potemkin village for your API.

> **v1.0** — stable release. API is frozen under [SemVer](https://semver.org/); breaking changes require a major bump.

`apitemkin` serves mock responses from a folder structure. Drop a file in `mocks/`, fetch its URL, get the response. No config-file routes, no inline DSL — **the file system is the API spec**.

## Install

```sh
npm i -D vite-plugin-apitemkin
```

Peer dependency: `vite ^7`. Node `>=20`.

## Quick start

```ts
// vite.config.ts
import { defineConfig } from 'vite';
import apitemkin from 'vite-plugin-apitemkin';

export default defineConfig({ plugins: [apitemkin()] });
```

Create a `mocks/` directory next to your `vite.config.ts`:

```
mocks/
├── healthcheck.json
└── users/
    ├── index.json
    ├── index.post.json
    └── [id].json
```

Fetch:

```sh
curl http://localhost:5173/api/healthcheck          # → mocks/healthcheck.json
curl http://localhost:5173/api/users                # → mocks/users/index.json
curl -X POST http://localhost:5173/api/users        # → mocks/users/index.post.json
curl http://localhost:5173/api/users/42             # → mocks/users/[id].json
```

Edit, add, or delete any file — changes apply without restarting the dev server.

## Using an AI assistant

Paste this into your `AGENTS.md`, `CLAUDE.md` or assistant instructions:

```
Mocks in this project use vite-plugin-apitemkin. Before writing or changing anything in `mocks/`, read `node_modules/vite-plugin-apitemkin/llms.txt`.
```

The guide ships in the npm package. You can also read it [on GitHub](packages/vite-plugin-apitemkin/llms.txt).

## Folder convention

Five rules:

1. **File path → URL path.** `mocks/users.json` serves `GET /api/users`; `mocks/users/posts.json` serves `GET /api/users/posts`.
2. **Filename suffix encodes method.** `users.post.json` = POST, `users.delete.ts` = DELETE, etc. Suffix omitted means GET.
3. **`[name]` segments are dynamic params.** Both in folders (`users/[id]/...`) and file basenames (`[id].json`). `[id]` becomes `:id` in the URL pattern.
4. **`index.{method}?.<ext>` inside a folder uses the folder's name as the URL segment.** `users/index.json` → `/api/users`, alongside `users/[id].json` → `/api/users/:id`.
5. **Specificity: literal segments beat params.** If both `mocks/users/me.json` and `mocks/users/[id].json` exist, `GET /api/users/me` resolves to the literal route; `GET /api/users/42` resolves to the param route.

A file `X.<ext>` and a folder named `X/` cannot be siblings — the scanner errors at startup with the exact `mv` command to consolidate:

```
apitemkin: ambiguous mock layout in mocks/

  - mocks/users.json
  - mocks/users/

Move the file into the folder as an index file:

    mv "mocks/users.json" "mocks/users/index.json"
```

## Dynamic mocks

Drop a `.ts`, `.js`, or `.mjs` file in `mocks/` (instead of `.json`) to compute the response from the request:

```ts
// mocks/users/[id].ts
import { defineMock } from 'vite-plugin-apitemkin';

interface User { id: number; name: string }

export default defineMock<User>(({ params, query }) => ({
  id: Number(params.id),
  name: query.expand === 'true' ? 'Ada Lovelace' : 'Ada',
}));
```

The handler receives a typed request context — `method`, `url`, `params`, `query`, `body`, `headers` — and returns either:

- **A response body** — sent as `application/json`, status `200`.
- **A rich response** `{ status?, headers?, body, delay? }` — when any of `status`, `headers`, or `delay` is present. Use this for non-200 responses, custom headers, per-route delay overrides.

Async handlers are supported. Thrown errors become `500 { error }` JSON.

### File-form rules

- Filename suffix and `[id]` params work the same as for JSON.
- `index.{method}?.ts` inside a folder uses the folder name as the URL segment.
- A `.json` and a code file for the same URL+method is an error — pick one.
- Body parsing is JSON-only (Content-Type `application/json`); other types leave `body` as `undefined`.
- String returns become `text/plain`; `Buffer` returns are sent as-is; everything else is `JSON.stringify`'d. Override via rich-response `headers`.

`defineMock<T>(fn)` is identity at runtime — purely a type-inference helper. Without it, annotate manually with the exported `ApitemkinHandler<T>` type.

## Scenarios

A single endpoint can expose multiple named response variants. Pass a scenarios map to `defineMock` instead of a function:

```ts
// mocks/orders/index.ts
import { defineMock } from 'vite-plugin-apitemkin';

export default defineMock<Order[]>({
  default: [{ id: 1, item: 'Lovelace pen', total: 12.5 }],
  empty:   [],
  error:   { status: 500, body: { error: 'Order service unavailable' } as any },
  slow:    { delay: 2000, body: [{ id: 1, item: 'eventually arrives', total: 1 }] },
  computed: ({ query }) => [{ id: Number(query.page) || 1, item: 'computed', total: 0 }],
});
```

Each variant can be a plain body, a `RichResponse`, or a handler function — same normalization rules as the function form. The `default` key is required.

Activate per request with `?_scenario=<name>`:

```sh
curl 'http://localhost:5173/api/orders?_scenario=error'   # → 500 JSON
```

`?apitemkin_scenario=` still works but is deprecated and will be removed in 2.0.

An unknown scenario silently falls back to `default` and logs a console warning. Discovery: `GET /_apitemkin/scenarios` returns a JSON list of every route with its kind (`'json' | 'code'`) and available scenario names. JSON files don't support scenarios — convert to `.ts` if you need variants.

### Partial overrides

When variants are *small tweaks* of a base body — the same User but `verified: false`, the same Order but in a different city — re-stating the entire object per variant gets noisy. Use `defineOverride(base, patch)` to deep-merge a partial onto a base:

```ts
import { defineMock, defineOverride } from 'vite-plugin-apitemkin';

const baseProfile = {
  id: 1,
  name: 'Ada',
  verified: true,
  address: { city: 'London', country: 'UK' },
};

export default defineMock<Profile>({
  default:    baseProfile,
  unverified: defineOverride(baseProfile, { verified: false }),
  inParis:    defineOverride(baseProfile, { address: { city: 'Paris' } }),
});
```

Plain objects merge recursively; **arrays, `null`, primitives, and class instances replace wholesale** — there's no element-level array merging or property-level synthesis. `undefined` patch values preserve the base. Inputs are never mutated. For shallow merges, native `{ ...base, ...patch }` is the right tool; reach for `defineOverride` when nesting is involved. For status or header variants, wrap explicitly: `{ status: 500, body: defineOverride(base, patch) }`.

### Generating data

For a list endpoint, `many(count, make)` builds the records for you. `make` gets the 0-based index.

```ts
import { defineMock, many } from 'vite-plugin-apitemkin';

export default defineMock(() =>
  many(50, (i) => ({ id: i + 1, name: `User ${i + 1}` })),
);
```

For realistic values, pair it with [Faker](https://fakerjs.dev). apitemkin doesn't bundle or require Faker. Install it yourself:

```sh
npm i -D @faker-js/faker
```

```ts
import { defineMock, many } from 'vite-plugin-apitemkin';
import { faker } from '@faker-js/faker';

faker.seed(1);

const users = many(50, (i) => ({
  id: i + 1,
  name: faker.person.fullName(),
  email: faker.internet.email(),
}));

export default defineMock(() => users);
```

Seed Faker and build the list at module top. The data is generated once, so it's the same on every request and after reloads. `many` throws a `RangeError` if `count` isn't a non-negative integer.

## Mocks that remember

A collection is an in-memory list that your route files share, so a `POST` shows up in the next `GET`. Put it in a file named `_data.ts` in the folder whose routes use it. It sorts to the top of the folder and is never a route; the endpoints stay ordinary files:

```
mocks/todos/
  _data.ts           the collection
  index.ts           GET    /api/todos        todos.list()
  index.post.ts      POST   /api/todos        todos.create()
  [id].ts            GET    /api/todos/:id    todos.get()
  [id].put.ts        PUT    /api/todos/:id    todos.replace()
  [id].patch.ts      PATCH  /api/todos/:id    todos.update()
  [id].delete.ts     DELETE /api/todos/:id    todos.remove()
```

```ts
// mocks/todos/_data.ts
import { defineCollection } from 'vite-plugin-apitemkin';

export const todos = defineCollection([
  { id: 1, title: 'Buy milk', done: false },
  { id: 2, title: 'Walk the dog', done: true },
]);
```

```ts
// mocks/todos/index.post.ts
import { defineMock } from 'vite-plugin-apitemkin';
import { todos } from './_data';

export default defineMock({
  default: todos.create(), // stores the record, 201
  error: { status: 500, body: { error: 'Server down' } },
});
```

| One-liner | Success | Errors |
| --- | --- | --- |
| `list()` | 200, every record | |
| `get()` | 200, the record | 404 |
| `create()` | 201, the stored record (id assigned if missing) | 400 not a JSON object, 409 id exists |
| `replace()` | 200, the new record; the URL id wins | 400, 404 |
| `update()` | 200, shallow-merged; the id never changes | 400, 404 |
| `remove()` | 204 | 404 |

For custom endpoints, use direct access in your own handler: `all()`, `find(id)`, `insert(record)`, `patch(id, changes)`, `delete(id)`. They return copies of the records, and you shape the response. Filtering and paging are plain code; nothing is built in:

```ts
// mocks/todos/open.ts  →  GET /api/todos/open
import { defineMock } from 'vite-plugin-apitemkin';
import { todos } from './_data';

export default defineMock(({ query }) => {
  const page = Number(query.page ?? 1);
  const open = todos.all().filter((t) => !t.done);
  return { items: open.slice((page - 1) * 10, page * 10), total: open.length };
});
```

Every seed record needs an id (or the field named by `idKey`), and ids must be unique; otherwise `defineCollection` throws an error that names the fix.

Options: `defineCollection(seed, { idKey, newId, wrap })`. `idKey` defaults to `'id'`. New ids count up from the highest numeric id (or are UUIDs for string ids). `wrap: (body) => ({ data: body })` shapes one-liner success bodies.

The data lives in memory only; nothing is written to your files. It resets when you save the `_data.ts` file, restart the dev server, or press Reset on the collection's line in the overlay. Editing a route file keeps it.

## Dev-tools overlay

Switching scenarios by hand-editing `?_scenario=…` in URLs gets old fast. The overlay puts a small launcher in a corner of your dev page. It tells you at a glance what's overridden (`orders: error`, or `2 overridden`), and opens a panel listing every discovered route with a per-route scenario picker.

```ts
// vite.config.ts — overlay is on by default in dev
export default defineConfig({ plugins: [apitemkin()] });

// To opt out:
export default defineConfig({ plugins: [apitemkin({ devtools: false })] });
```

How it works:

- The plugin auto-injects a single `<script type="module" src="/_apitemkin/devtools.js">` tag into the host app's HTML during dev. `vite build` never sees it.
- The overlay fetches `/_apitemkin/scenarios`, persists per-route picks in `localStorage` under `apitemkin:selections`, and patches `window.fetch` + `XMLHttpRequest.open` to append `_scenario=<name>` on outgoing requests for matching routes. Cross-origin requests, non-matched URLs, and routes left at `default` are passed through unchanged.
- **URL params win.** A request whose URL already has `_scenario=…` (or the deprecated `apitemkin_scenario=…`) is left alone — manual URL hacking and the panel coexist. The panel sets the route's *default* behavior across the app; an explicit per-call query param overrides for that one call.
- The panel itself lives in a closed shadow root, so the host page's CSS can't bleed in and the overlay's CSS can't bleed out. The bundle is ≤ 150 kB minified (about 35 kB today).
- JSON mocks have no scenarios, so they show no picker — switch to a `.ts` file with `defineMock(scenariosMap)` if you want variants.

What the panel does:

- **Overrides stand out.** A route switched away from `default` shows its scenario in a pale mustard pill; nothing else in the list is mustard. The footer filters to just those routes (`Show 2 overridden`) and resets them (`Reset scenarios`).
- **Find routes fast.** Routes are grouped by folder, and a search field appears once you have 8 or more (`/` focuses it).
- **Request log.** Each row ends in a log button. It opens every recent request to that route, newest first: the scenario that answered, status and time, a source tag (`via _scenario param` when the request carried its own `?_scenario=`, `via picker` when the scenario came from this panel), a waiting time for slow requests, and `not in mocks → default` for names your mocks don't define. The button turns red when the route's last request failed unexpectedly (a 5xx on a request that carried no scenario). A request that sends its own `?_scenario=` still wins, but the picker stays yours for every request that doesn't.
- **Keyboard.** `Alt+Shift+M` (`⌥⇧M` on macOS) opens and closes the panel from anywhere; arrow keys move through the list; `Esc` closes.
- **Fits your page.** Drag the panel's edge to resize it (or focus the grip and use the arrow keys). Move the launcher to any corner by dragging it, or with `Alt+Shift+arrow keys`. Both are remembered.
- **Light or dark.** It follows your OS setting by default. The theme button in the panel header switches between Auto, Light and Dark, and remembers your choice.

The overlay is per-tab via `localStorage`; the dev server itself stays stateless. State that points at routes or scenario names that no longer exist is pruned silently on the next discovery.

## Options

| Option      | Type      | Default   | Description                                                              |
| ----------- | --------- | --------- | ------------------------------------------------------------------------ |
| `enabled`   | `boolean` | `true`    | Toggle the plugin off without removing it from `vite.config.ts`.         |
| `mocksDir`  | `string`  | `'mocks'` | Directory to scan for mock files. Resolved relative to the Vite root.    |
| `urlPrefix` | `string`  | `'/api'`  | URL prefix to mount mocks under. Pass `''` for the host root.            |
| `delay`     | `number`  | `150`     | Global artificial delay in ms before each response. Pass `0` to disable. Code mocks can override per-route via `RichResponse.delay`. |
| `devtools`  | `boolean` | `true`    | Auto-inject the in-browser dev-tools overlay (launcher + scenario panel). Set `false` to opt out — the plugin then never touches the host HTML or registers `/_apitemkin/devtools.js`. |
| `fallthrough` | `boolean` | `false` | Send requests under `urlPrefix` that match no mock on to Vite, e.g. to `server.proxy` and your real backend, instead of a JSON 404. |

The plugin is hardcoded to `apply: 'serve'` — Vite skips it during `vite build`. Unless `fallthrough` is on, any URL under `urlPrefix` that doesn't match a mock returns a `404` JSON response (not Vite's SPA HTML fallback), so API consumers always get JSON.

## Mocking some endpoints, proxying the rest

```ts
// vite.config.ts
import { defineConfig } from 'vite';
import apitemkin from 'vite-plugin-apitemkin';

export default defineConfig({
  server: { proxy: { '/api': 'http://localhost:8080' } },
  plugins: [apitemkin({ fallthrough: true })],
});
```

Mock a few endpoints; every other `/api` request goes to your real backend. If `fallthrough` is on and `server.proxy` is empty, the plugin logs a warning at startup.

## Roadmap

| Version | Status  | Theme                                                                                  |
| ------- | ------- | -------------------------------------------------------------------------------------- |
| 1.3     | shipped | Easier to start: AI guide, fall-through to a real backend, `many()` helper             |
| 1.4     | shipped | Redesigned dev-tools overlay                                                           |
| 1.5     | shipped | Mocks that remember: in-memory CRUD collections                                        |
| 2.0     | planned | Remove deprecated `apitemkin_scenario` param                                           |
| later   | maybe   | Docs site; HAR/OpenAPI import; catch-all params (`[...slug]`); WebSocket/SSE support   |

See [docs/development-plan.md](./docs/development-plan.md) for the plan and [CHANGELOG.md](./CHANGELOG.md) for shipped release notes.

## Repository layout

npm workspaces monorepo:

- `packages/vite-plugin-apitemkin/` — the publishable plugin.
- `packages/playground/` — a Vite app used for live development and as the executable example of the folder convention.

See [DEVELOPMENT.md](./DEVELOPMENT.md) for contributor setup.

## License

MIT © 2026 Jan Opavsky
