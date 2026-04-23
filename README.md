# vite-plugin-apitemkin

Plug-and-play mock API plugin for Vite. The Potemkin village for your API.

> **Status: pre-alpha / scaffolding.** Not yet functional. See [docs/development-plan.md](./docs/development-plan.md).

This is the monorepo root. The published plugin lives at [`packages/vite-plugin-apitemkin/`](./packages/vite-plugin-apitemkin/).

## Layout

- [`packages/vite-plugin-apitemkin/`](./packages/vite-plugin-apitemkin/) — the publishable Vite plugin.
- `packages/playground/` — Vite app consuming the plugin via npm-workspaces symlink (added in the next chunk).

## Workflow

```sh
npm install
npm test          # vitest, fanned out to all workspaces
npm run typecheck # tsc --noEmit, fanned out to all workspaces
npm run build     # tsup → ESM + .d.ts in packages/vite-plugin-apitemkin/dist/
```

See [DEVELOPMENT.md](./DEVELOPMENT.md) for details.

## License

MIT © 2026 Jan Opavsky
