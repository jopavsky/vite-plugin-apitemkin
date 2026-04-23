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

Activate per request with `?apitemkin_scenario=<name>`:

```sh
curl 'http://localhost:5173/api/orders?apitemkin_scenario=error'   # → 500 JSON
```

An unknown scenario silently falls back to `default` and logs a console warning. Discovery: `GET /_apitemkin/scenarios` returns a JSON list of every route with its kind (`'json' | 'code'`) and available scenario names. JSON files don't support scenarios — convert to `.ts` if you need variants.

## Options

| Option      | Type      | Default   | Description                                                              |
| ----------- | --------- | --------- | ------------------------------------------------------------------------ |
| `enabled`   | `boolean` | `true`    | Toggle the plugin off without removing it from `vite.config.ts`.         |
| `mocksDir`  | `string`  | `'mocks'` | Directory to scan for mock files. Resolved relative to the Vite root.    |
| `urlPrefix` | `string`  | `'/api'`  | URL prefix to mount mocks under. Pass `''` for the host root.            |
| `delay`     | `number`  | `150`     | Global artificial delay in ms before each response. Pass `0` to disable. Code mocks can override per-route via `RichResponse.delay`. |

The plugin is hardcoded to `apply: 'serve'` — Vite skips it during `vite build`. Any URL under `urlPrefix` that doesn't match a mock returns a `404` JSON response (not Vite's SPA HTML fallback), so API consumers always get JSON.

## Roadmap

| Version  | Status    | Theme                                                    |
| -------- | --------- | -------------------------------------------------------- |
| `1.1.0`  | post-1.0  | Devtools overlay UI for scenario switching               |
| post-1.0 | maybe     | Catch-all params (`[...slug]`); WebSocket/SSE support    |

See [CHANGELOG.md](./CHANGELOG.md) for shipped release notes.

## Repository layout

npm workspaces monorepo:

- `packages/vite-plugin-apitemkin/` — the publishable plugin.
- `packages/playground/` — a Vite app used for live development and as the executable example of the folder convention.

See [DEVELOPMENT.md](./DEVELOPMENT.md) for contributor setup.

## License

MIT © 2026 Jan Opavsky
