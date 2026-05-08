import { defineConfig } from 'tsdown';

export default defineConfig([
  // Node entry — the published plugin (ESM only, with type definitions).
  {
    entry: ['src/index.ts'],
    format: ['esm'],
    dts: true,
    clean: true,
    target: 'node18',
    sourcemap: true,
  },
  // Browser entry — the dev-tools overlay client. Served by the plugin at
  // /_apitemkin/devtools.js; not part of the package's public exports.
  // outputOptions.entryFileNames overrides tsdown's default per-format
  // suffixing so the file is plainly dist/devtools.client.js.
  {
    entry: { 'devtools.client': 'src/devtools/client.ts' },
    format: ['iife'],
    platform: 'browser',
    target: 'es2020',
    minify: true,
    sourcemap: false,
    dts: false,
    clean: false,
    // The IIFE has no exports (it's purely side-effecting), but Rolldown
    // warns if `output.name` is missing. Set a name to silence the warning.
    outputOptions: { entryFileNames: '[name].js', name: 'apitemkinDevtools' },
  },
]);
