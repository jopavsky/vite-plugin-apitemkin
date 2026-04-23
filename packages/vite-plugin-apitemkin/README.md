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

Switch with `?apitemkin_scenario=error`. Discovery at `GET /_apitemkin/scenarios`.

See the [GitHub README](https://github.com/jopavsky/vite-plugin-apitemkin#readme) for the full folder convention, scenarios, options table, and roadmap.

## License

MIT © 2026 Jan Opavsky
