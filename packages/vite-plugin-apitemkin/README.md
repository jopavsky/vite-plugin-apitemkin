# vite-plugin-apitemkin

Plug-and-play mock API plugin for Vite. The folder structure is the API spec.

## Install

```sh
npm i -D vite-plugin-apitemkin
```

Peer dependency: `vite ^5 || ^6 || ^7`. Node `>=18`.

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

Add, edit, or delete files at runtime — no dev-server restart needed. The plugin is dev-only; `vite build` ignores it.

See the project repository for the full folder convention, options table, and examples.

## License

MIT © 2026 Jan Opavsky
