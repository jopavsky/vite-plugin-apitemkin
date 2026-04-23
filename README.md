# vite-plugin-apitemkin

Plug-and-play mock API plugin for Vite. The Potemkin village for your API.

> **Status: pre-1.0.** v0.1 is feature-complete but not yet published. Expect API changes before 1.0.

`apitemkin` serves mock JSON responses from a folder structure. Drop a JSON file in `mocks/`, fetch its URL, get the response. No config-file routes, no inline DSL — **the file system is the API spec**.

## Install

```sh
npm i -D vite-plugin-apitemkin
```

Peer dependency: `vite ^5 || ^6 || ^7`. Node `>=18`.

## Quick start

```ts
// vite.config.ts
import { defineConfig } from 'vite';
import apitemkin from 'vite-plugin-apitemkin';

export default defineConfig({
  plugins: [apitemkin()],
});
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

Fetch the routes:

```sh
curl http://localhost:5173/api/healthcheck
# → { "status": "ok" }

curl http://localhost:5173/api/users
# → [{ "id": 1, "name": "Ada" }, ...]

curl -X POST http://localhost:5173/api/users
# → { "status": "created" }

curl http://localhost:5173/api/users/42
# → matched via [id].json
```

Edit, add, or delete any JSON file — changes apply without restarting the dev server.

## Folder convention

The directory tree maps to URLs. Six rules:

1. **File path → URL path.** `mocks/users.json` serves `GET /api/users`. `mocks/users/posts.json` serves `GET /api/users/posts`.
2. **Filename suffix encodes HTTP method.** `users.post.json` = POST, `users.delete.json` = DELETE, `users.patch.json` = PATCH, etc. Suffix omitted means GET. So `users.json` ≡ `users.get.json`.
3. **`[name]` segments are dynamic params.** They work in folder names (`users/[id]/...`) and file basenames (`[id].json`). `[id]` becomes `:id` in the URL pattern.
4. **`index.{method}?.json` inside a folder uses the folder's name as the URL segment.** So `users/index.json` → `/api/users`, alongside `users/[id].json` → `/api/users/:id`.
5. **A file `X.json` and a folder `X/` cannot be siblings.** The plugin refuses to start and tells you exactly which file to move.
6. **JSON only at v0.1.** File contents are served verbatim with `Content-Type: application/json`. Dynamic JS/TS callback files arrive in v0.2.

### Flat form vs folder form

```
# Trivial endpoint with no children — flat file:
mocks/healthcheck.json              → GET /api/healthcheck

# Resource with sub-routes — folder + index files:
mocks/users/
├── index.json                      → GET    /api/users
├── index.post.json                 → POST   /api/users
├── [id].json                       → GET    /api/users/:id
└── [id].delete.json                → DELETE /api/users/:id
```

If you start flat with `mocks/users.json` and later add `mocks/users/[id].json`, the scanner refuses to start with a guided message:

```
apitemkin: ambiguous mock layout in mocks/

  - mocks/users.json
  - mocks/users/

A file and a folder share the name "users", so it's unclear which one
owns the same URL prefix. Move the file into the folder as an index file:

    mv "mocks/users.json" "mocks/users/index.json"
```

### Routing specificity

When multiple routes could match, **literal segments beat params** at the same position. So if both `mocks/users/me.json` and `mocks/users/[id].json` exist, `GET /api/users/me` resolves to the literal route; `GET /api/users/42` resolves to the param route.

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

- **The response body** — sent as `application/json` with status `200`.
- **A rich response** `{ status?, headers?, body }` — when `status`, `headers`, or both are present. Use this for non-200 responses, custom headers, or non-JSON bodies.

Async handlers are supported. If the handler throws, the response is `500` JSON `{ error: <message> }`.

```ts
// mocks/teapot.ts — custom status + body
export default defineMock(() => ({
  status: 418,
  body: { reason: "I'm a teapot" },
}));

// mocks/echo.post.ts — JSON body parsed automatically when Content-Type matches
export default defineMock(({ body }) => ({ received: body }));

// mocks/slow.ts — override the global delay for a specific endpoint
export default defineMock(() => ({
  delay: 2000,
  body: { took: 'a while' },
}));
```

### File-form rules

- **Filename suffix and `[id]` params work the same as for JSON.** `users.post.ts` = POST handler; `users/[id].ts` captures `:id`.
- **`index.{method}?.ts` inside a folder** uses the folder name as the URL segment, exactly like the JSON case.
- **Code/JSON collision is an error.** A `users.json` and a `users.ts` mapping to the same URL+method causes a startup error with both file paths. Pick one form per route.
- **Body parsing is JSON-only.** When `Content-Type: application/json`, `req.body` is the parsed value. Other content types leave `body` as `undefined`. Form, multipart, and binary parsing are deferred.
- **String returns become `text/plain`; `Buffer` returns are sent verbatim;** anything else is `JSON.stringify`'d. Override `Content-Type` via the rich-response `headers` field.

### TypeScript

`defineMock<T>(handler)` is identity at runtime; its purpose is type inference on the handler's response. Without it, you can annotate manually:

```ts
import type { ApitemkinHandler } from 'vite-plugin-apitemkin';

const handler: ApitemkinHandler<User> = (req) => ({ id: 1, name: 'Ada' });
export default handler;
```

## Options

| Option      | Type      | Default   | Description                                                                       |
| ----------- | --------- | --------- | --------------------------------------------------------------------------------- |
| `enabled`   | `boolean` | `true`    | Toggle the plugin off without removing it from `vite.config.ts`.                  |
| `mocksDir`  | `string`  | `'mocks'` | Directory to scan for mock files. Resolved relative to the Vite root.             |
| `urlPrefix` | `string`  | `'/api'`  | URL prefix to mount mocks under. Pass `''` to mount at the host root.             |
| `delay`     | `number`  | `150`     | Global artificial delay in ms before each response — simulates network latency. Pass `0` to disable. Code mocks can override per-route via `RichResponse.delay`. |

### Dev-only by construction

The plugin is hardcoded to `apply: 'serve'` — Vite skips it during `vite build`. There is no `apply` option, no opt-in for build-time activation, and no chance of accidentally shipping mocks to production.

### The plugin owns the configured prefix

Any URL under `urlPrefix` that doesn't match a mock returns a `404` JSON response, **not** Vite's SPA fallback HTML. This means consumers of `/api/*` always get JSON-shaped responses, never a misleading 200 with `<!doctype html>` for an unmatched route.

## Why another mock plugin?

Existing options each have rough edges: broken HMR when mock files change, file-based-routing boilerplate, fuzzy dev/prod story, weak typing, bloated dependencies. `apitemkin` aims to be the opposite:

- **Folder-based, no inline route declarations.** The directory tree is the spec.
- **Real HMR for mock changes.** Add, edit, or delete files — no restart.
- **Dev-only by construction.** Production builds never see the plugin.
- **TypeScript native.** Authored in TS, ships ESM + `.d.ts`.
- **Zero runtime dependencies.** Built on Vite's middleware and Node built-ins.
- **Deliberately narrow.** HTTP + JSON. No WebSocket, no SSE, no GraphQL, no OpenAPI ingestion.

## Roadmap

| Version  | Status               | Theme                                                  |
| -------- | -------------------- | ------------------------------------------------------ |
| `0.0.x`  | done                 | Scaffolding (monorepo + TS + tsdown + playground)      |
| `0.1.0`  | shipped              | Folder-based JSON mocks with HMR                       |
| `0.2.0`  | in branch            | Dynamic JS/TS callback responses (stateful, computed)  |
| `0.3.0`  | next                 | Scenarios — multiple variants per route, switch on the fly |
| `1.0.0`  | planned              | API freeze, semver guarantees                          |
| post-1.0 | maybe                | WebSocket and SSE support, if there's real demand      |

See [docs/development-plan.md](./docs/development-plan.md) for the full plan.

## Repository layout

This is a monorepo using npm workspaces:

- [`packages/vite-plugin-apitemkin/`](./packages/vite-plugin-apitemkin/) — the publishable plugin.
- [`packages/playground/`](./packages/playground/) — a Vite app used for live development and as the executable example of the folder convention.

See [DEVELOPMENT.md](./DEVELOPMENT.md) for contributor setup.

## License

MIT © 2026 Jan Opavsky
