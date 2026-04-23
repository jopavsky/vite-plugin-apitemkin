# Development

This is a monorepo using npm workspaces.

## Prerequisites

- Node.js `>=18`
- npm 7+ (workspace support)

## Setup

```sh
git clone <repo> vite-plugin-apitemkin
cd vite-plugin-apitemkin
npm install
```

`npm install` at the root installs deps for all workspace packages and creates the workspace symlinks under `node_modules/`.

## Layout

```
vite-plugin-apitemkin/             (workspace root — this dir)
├── package.json                   (workspaces config + fan-out scripts)
├── tsconfig.base.json             (shared TS compiler options)
├── packages/
│   └── vite-plugin-apitemkin/     (the publishable plugin package)
└── docs/                          (long-form docs)
```

## Common tasks

| From the root | What it does |
| --- | --- |
| `npm test` | Runs vitest in every workspace that has a `test` script. |
| `npm run typecheck` | Runs `tsc --noEmit` in every workspace that has a `typecheck` script. |
| `npm run build` | Builds the plugin (`tsup` → ESM + `.d.ts` in `dist/`). |

For per-package work, `cd` into the package or use `npm <script> -w <package-name>`.

## Plugin package conventions

- Source is TypeScript in `packages/vite-plugin-apitemkin/src/`.
- Built with **tsup** to ESM + `.d.ts` (`dist/`).
- `verbatimModuleSyntax: true` is on globally — type-only imports must use `import type` or the inline `type` keyword.
- Use `import type { Plugin } from 'vite'` rather than redeclaring Vite types.

## Release process

From `packages/vite-plugin-apitemkin/`:

1. Bump `version` in the package's `package.json`.
2. `npm run prepublishOnly` (auto-runs typecheck + test + build).
3. `npm publish --access public`.
4. Tag the commit: `git tag v0.x.y && git push --tags`.

## Sanity-check the published shape

```sh
cd packages/vite-plugin-apitemkin
npm run build
npm pack --dry-run
```

The tarball should contain only `dist/`, `README.md`, `LICENSE`, and `package.json`.
