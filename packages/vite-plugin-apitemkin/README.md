# vite-plugin-apitemkin

Plug-and-play mock API plugin for Vite. The Potemkin village for your API.

> **Status: pre-alpha / scaffolding.** The plugin currently registers itself but does nothing. Folder-based mock serving lands in v0.1.

## Install

```sh
npm i -D vite-plugin-apitemkin
```

Peer dependency: `vite` `^5 || ^6 || ^7`.

## Usage

```ts
// vite.config.ts
import { defineConfig } from 'vite';
import apitemkin from 'vite-plugin-apitemkin';

export default defineConfig({
  plugins: [apitemkin()],
});
```

### Planned: folder-based mocks (v0.1)

Drop JSON files under `mocks/` and they get served. URL = file path; HTTP method = filename suffix (default GET); `[id]` = dynamic param.

```
mocks/
├── users.json              → GET    /users
├── users.post.json         → POST   /users
└── users/
    └── [id].json           → GET    /users/:id
```

## Current options

| Option    | Type      | Default | Description                                |
| --------- | --------- | ------- | ------------------------------------------ |
| `enabled` | `boolean` | `true`  | Toggle the plugin off without removing it. |

The plugin is dev-only by construction — Vite skips it during `vite build`. There is no opt-in for build-time activation.

## Why another mock plugin?

Existing options each have rough edges: broken HMR when mock files change, file-based-routing boilerplate, fuzzy dev/prod story, weak typing, bloated dependencies. `apitemkin` aims to be the opposite:

- Folder-based — no inline route declarations.
- Real HMR for mock changes.
- Dev-only by default; production stays clean.
- TypeScript native, ships `.d.ts`.
- Zero runtime dependencies.

## License

MIT © 2026 Jan Opavsky
