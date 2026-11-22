# vite-plugin-apitemkin

Plug-and-play mock API plugin for Vite. The folder structure is the API spec.

📚 **Full documentation:** [github.com/jopavsky/vite-plugin-apitemkin](https://github.com/jopavsky/vite-plugin-apitemkin#readme)

## Install

```sh
npm i -D vite-plugin-apitemkin
```

Peer dependency: `vite ^7`. Node `>=20`.

## Usage

```ts
// vite.config.ts
import apitemkin from 'vite-plugin-apitemkin';

export default {
  plugins: [apitemkin()],
};
```

Drop JSON files under `mocks/` and they're served at `/api/<path>`:

```
mocks/users/index.json      → GET  /api/users
mocks/users/index.post.json → POST /api/users
mocks/users/[id].json       → GET  /api/users/:id
```

Or use a TypeScript handler for dynamic responses:

```ts
// mocks/users/[id].ts
import { defineMock } from 'vite-plugin-apitemkin';

export default defineMock(({ params }) => ({
  id: Number(params.id),
  name: 'Ada Lovelace #' + params.id,
}));
```

Handlers receive `params`, `query`, `body`, `headers` and return either the response body or `{ status?, headers?, body }`. Add, edit, or delete files at runtime — no dev-server restart needed. The plugin is dev-only; `vite build` ignores it.

For multiple response variants per endpoint, pass a scenarios map to `defineMock`:

```ts
import { defineMock } from 'vite-plugin-apitemkin';

export default defineMock({
  default: [{ id: 1, name: 'Ada' }],
  empty:   [],
  error:   { status: 500, body: { error: 'oops' } },
});
```

Switch with `?_scenario=error`. Discovery at `GET /_apitemkin/scenarios`.

Set `fallthrough: true` to pass unmatched `/api` requests on to `server.proxy` instead of a JSON 404; see the full docs.

For variants that are small tweaks of a base body, use `defineOverride` to deep-merge a partial:

```ts
import { defineMock, defineOverride } from 'vite-plugin-apitemkin';

const baseUser = { id: 1, name: 'Ada', verified: true, address: { city: 'London' } };

export default defineMock({
  default:    baseUser,
  unverified: defineOverride(baseUser, { verified: false }),
  inParis:    defineOverride(baseUser, { address: { city: 'Paris' } }),
});
```

Arrays / `null` / primitives replace wholesale; `undefined` preserves the base; inputs are never mutated.

To generate a list of records, use `many(count, make)`:

```ts
import { defineMock, many } from 'vite-plugin-apitemkin';

export default defineMock(() => many(50, (i) => ({ id: i + 1, name: `User ${i + 1}` })));
```

## Using an AI assistant

Paste this into your `AGENTS.md`, `CLAUDE.md` or assistant instructions:

```
Mocks in this project use vite-plugin-apitemkin. Before writing or changing anything in `mocks/`, read `node_modules/vite-plugin-apitemkin/llms.txt`.
```

The guide ships in the npm package. You can also read it [on GitHub](https://github.com/jopavsky/vite-plugin-apitemkin/blob/main/packages/vite-plugin-apitemkin/llms.txt).

## Dev-tools overlay

Auto-injected in dev. A launcher in a corner of your app shows what's overridden; the panel lists every route with a per-route scenario picker, search, folder groups and a per-route request log. `Alt+Shift+M` (`⌥⇧M` on macOS) toggles it. Selections persist per tab in `localStorage`; the plugin patches `fetch` and `XMLHttpRequest.open` to append `?_scenario=<name>` on outgoing requests automatically. Opt out with `apitemkin({ devtools: false })`.

See the [GitHub README](https://github.com/jopavsky/vite-plugin-apitemkin#readme) for the full folder convention, scenarios, options table, and roadmap.

## License

MIT © 2026 Jan Opavsky
