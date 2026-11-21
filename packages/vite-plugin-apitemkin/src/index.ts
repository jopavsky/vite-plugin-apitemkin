import { readFile } from 'node:fs/promises';
import { isAbsolute, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Plugin, ResolvedConfig, ViteDevServer } from 'vite';
import { isMockFile } from './core/scanner.js';
import { createMockEngine } from './core/engine.js';

export interface ApitemkinOptions {
  enabled?: boolean;
  mocksDir?: string;
  urlPrefix?: string;
  /**
   * Global artificial delay (in milliseconds) before sending each response.
   * Simulates real-world network latency during local development.
   * Per-route override is available via `RichResponse.delay` from a code mock.
   * Default: 150.
   */
  delay?: number;
  /**
   * Auto-inject the in-browser dev-tools overlay into the host app's HTML
   * during dev. The overlay lists all discovered routes and lets you switch
   * the active scenario per route from a corner panel — no source changes,
   * no manual `?_scenario=` URLs. Only active in `serve` mode;
   * `vite build` never sees the injection.
   * Default: true.
   */
  devtools?: boolean;
  /**
   * Pass requests under `urlPrefix` that match no mock on to Vite (e.g.
   * `server.proxy`) instead of answering 404.
   * Default: false.
   */
  fallthrough?: boolean;
}

// Resolved at module load: the on-disk path of the precompiled overlay
// client (`dist/devtools.client.js`) sitting next to the bundled plugin
// entry. Evaluated lazily (on first request) and cached.
const devtoolsClientPath = fileURLToPath(
  new URL('./devtools.client.js', import.meta.url),
);
let devtoolsClientCache: string | undefined;

export default function apitemkin(options: ApitemkinOptions = {}): Plugin {
  const {
    enabled = true,
    mocksDir = 'mocks',
    urlPrefix = '/api',
    delay: globalDelay = 150,
    devtools = true,
    fallthrough = false,
  } = options;

  let resolvedMocksDir = '';

  return {
    name: 'vite-plugin-apitemkin',
    apply: 'serve',

    configResolved(config: ResolvedConfig) {
      if (!enabled) return;
      resolvedMocksDir = resolve(config.root, mocksDir);
    },

    transformIndexHtml() {
      if (!enabled || !devtools) return;
      return [
        {
          tag: 'script',
          attrs: { type: 'module', src: '/_apitemkin/devtools.js' },
          injectTo: 'body',
        },
      ];
    },

    async configureServer(server: ViteDevServer) {
      if (!enabled) return;

      if (
        fallthrough &&
        urlPrefix &&
        Object.keys(server.config.server.proxy ?? {}).length === 0
      ) {
        server.config.logger.warn(
          `apitemkin: fallthrough is on but server.proxy is not configured, so unmatched ${urlPrefix || '/'} requests will reach Vite's own handlers (usually your index.html).`,
        );
      }

      const engine = createMockEngine({
        mocksDir: resolvedMocksDir,
        urlPrefix,
        delay: globalDelay,
        fallthrough,
        loadModule: (p) => server.ssrLoadModule(p),
      });

      const rescan = async () => {
        try {
          await engine.rescan();
        } catch (err) {
          server.config.logger.error(
            `apitemkin: ${(err as Error).message}`,
          );
        }
      };

      await rescan();

      server.watcher.add(resolvedMocksDir);
      const handleChange = (file: string) => {
        if (!isMockFile(file)) return;
        if (!isInsideMocks(file, resolvedMocksDir)) return;
        rescan();
      };
      server.watcher.on('add', handleChange);
      server.watcher.on('change', handleChange);
      server.watcher.on('unlink', handleChange);

      // v1.2 — overlay client. Served from the package's own dist/ next to
      // the plugin entry. Lazy-read + cached. Registered before the matcher
      // so a user-defined /_apitemkin/* mock can't shadow it.
      if (devtools) {
        server.middlewares.use(async (req, res, next) => {
          if (req.method !== 'GET') return next();
          const reqPath = (req.url ?? '').split('?')[0]!.split('#')[0]!;
          if (reqPath !== '/_apitemkin/devtools.js') return next();
          try {
            if (devtoolsClientCache === undefined) {
              devtoolsClientCache = await readFile(devtoolsClientPath, 'utf8');
            }
            res.setHeader(
              'Content-Type',
              'application/javascript; charset=utf-8',
            );
            res.setHeader('Cache-Control', 'no-cache');
            res.statusCode = 200;
            res.end(devtoolsClientCache);
          } catch (err) {
            res.statusCode = 500;
            res.setHeader('Content-Type', 'application/json');
            res.end(
              JSON.stringify({
                error: `apitemkin: failed to load devtools client (${(err as Error).message}). Run \`npm run build\` in the plugin package.`,
              }),
            );
          }
        });
      }

      // v0.3 — discovery endpoint. Registered first so it always wins,
      // even if a user accidentally creates a /_apitemkin/* mock.
      server.middlewares.use(async (req, res, next) => {
        if (req.method !== 'GET') return next();
        const reqPath = (req.url ?? '').split('?')[0]!.split('#')[0]!;
        if (reqPath !== '/_apitemkin/scenarios') return next();

        const entries = await engine.discovery();
        res.setHeader('Content-Type', 'application/json');
        res.statusCode = 200;
        res.end(JSON.stringify(entries));
      });

      server.middlewares.use(async (req, res, next) => {
        if (!(await engine.handle(req, res))) next();
      });
    },
  };
}

function isInsideMocks(file: string, mocksDir: string): boolean {
  const abs = isAbsolute(file) ? file : resolve(file);
  const rel = relative(mocksDir, abs);
  return rel !== '' && !rel.startsWith('..') && !isAbsolute(rel);
}

export { apitemkin };
export { scanMocks } from './core/scanner.js';
export type {
  HttpMethod,
  MockRoute,
  MockRouteKind,
  PathSegment,
} from './core/scanner.js';
export { matchRoute } from './core/matcher.js';
export type { MatchResult } from './core/matcher.js';
export { defineOverride } from './core/runtime.js';
export { defineMock } from './core/define-mock.js';
export { many } from './core/many.js';
export type {
  ApitemkinHandler,
  ApitemkinRequest,
  DeepPartial,
  RichResponse,
  ScenarioValue,
  ScenariosMap,
  ScenariosHandler,
} from './core/runtime.js';
