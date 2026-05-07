import { readFile } from 'node:fs/promises';
import { isAbsolute, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Plugin, ResolvedConfig, ViteDevServer } from 'vite';
import { scanMocks, type MockRoute } from './scanner.js';
import { matchRoute } from './matcher.js';
import {
  invokeHandler,
  sleep,
  type ApitemkinHandler,
  type ApitemkinRequest,
  type ScenariosHandler,
  type ScenariosMap,
  type ScenarioValue,
} from './runtime.js';

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
   * no manual `?apitemkin_scenario=` URLs. Only active in `serve` mode;
   * `vite build` never sees the injection.
   * Default: true.
   */
  devtools?: boolean;
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
  } = options;

  let resolvedMocksDir = '';
  let routes: MockRoute[] = [];

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

      const rescan = async () => {
        try {
          routes = await scanMocks(resolvedMocksDir, urlPrefix);
        } catch (err) {
          server.config.logger.error(
            `apitemkin: ${(err as Error).message}`,
          );
        }
      };

      await rescan();

      server.watcher.add(resolvedMocksDir);
      const handleChange = (file: string) => {
        if (!file.endsWith('.json')) return;
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

        const entries = await Promise.all(
          routes.map(async (route) => {
            let scenarios: string[] = [];
            if (route.kind === 'code') {
              try {
                const mod = await server.ssrLoadModule(route.filePath);
                const handler = (mod as { default?: unknown }).default;
                scenarios =
                  (handler as { __apitemkin_scenarios?: string[] })
                    ?.__apitemkin_scenarios ?? [];
              } catch {
                /* swallow — module load error shouldn't break discovery */
              }
            }
            return {
              method: route.method,
              url: route.urlPattern,
              kind: route.kind,
              scenarios,
            };
          }),
        );
        res.setHeader('Content-Type', 'application/json');
        res.statusCode = 200;
        res.end(JSON.stringify(entries));
      });

      server.middlewares.use(async (req, res, next) => {
        if (!req.url || !req.method) return next();

        const match = matchRoute(routes, req.method, req.url, urlPrefix);
        if (match) {
          try {
            if (match.route.kind === 'json') {
              const body = await readFile(match.route.filePath, 'utf8');
              if (globalDelay > 0) await sleep(globalDelay);
              res.setHeader('Content-Type', 'application/json');
              res.statusCode = 200;
              res.end(body);
            } else {
              const result = await invokeHandler(
                server,
                match.route,
                req,
                match.params,
              );
              const effectiveDelay = result.delay ?? globalDelay;
              if (effectiveDelay > 0) await sleep(effectiveDelay);
              for (const [k, v] of Object.entries(result.headers)) {
                res.setHeader(k, v);
              }
              res.statusCode = result.status;
              const hasContentType = res.getHeader('content-type') !== undefined;
              let payload: string | Buffer;
              if (typeof result.body === 'string') {
                if (!hasContentType) {
                  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
                }
                payload = result.body;
              } else if (Buffer.isBuffer(result.body)) {
                payload = result.body;
              } else {
                if (!hasContentType) {
                  res.setHeader('Content-Type', 'application/json');
                }
                payload = JSON.stringify(result.body) ?? '';
              }
              res.end(payload);
            }
          } catch (err) {
            res.statusCode = 500;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ error: (err as Error).message }));
          }
          return;
        }

        // Claim the prefix: any unmatched URL under it gets a 404 (not SPA fallback).
        if (urlPrefix && isUnderPrefix(req.url, urlPrefix)) {
          res.statusCode = 404;
          res.setHeader('Content-Type', 'application/json');
          res.end(
            JSON.stringify({ error: `No mock for ${req.method} ${req.url}` }),
          );
          return;
        }

        next();
      });
    },
  };
}

function isUnderPrefix(url: string, prefix: string): boolean {
  const path = url.split('?')[0]!.split('#')[0]!;
  const norm = prefix.endsWith('/') ? prefix.slice(0, -1) : prefix;
  return path === norm || path.startsWith(norm + '/');
}

function isInsideMocks(file: string, mocksDir: string): boolean {
  const abs = isAbsolute(file) ? file : resolve(file);
  const rel = relative(mocksDir, abs);
  return rel !== '' && !rel.startsWith('..') && !isAbsolute(rel);
}

function extractScenario(url: string): string | undefined {
  const q = url.indexOf('?');
  if (q === -1) return undefined;
  const queryStr = url.slice(q + 1).split('#')[0]!;
  const params = new URLSearchParams(queryStr);
  return params.get('apitemkin_scenario') ?? undefined;
}

export { apitemkin };
export { scanMocks } from './scanner.js';
export type {
  HttpMethod,
  MockRoute,
  MockRouteKind,
  PathSegment,
} from './scanner.js';
export { matchRoute } from './matcher.js';
export type { MatchResult } from './matcher.js';
export { defineOverride } from './runtime.js';
export type {
  ApitemkinHandler,
  ApitemkinRequest,
  DeepPartial,
  RichResponse,
  ScenarioValue,
  ScenariosMap,
  ScenariosHandler,
} from './runtime.js';

/**
 * Define a mock handler. Accepts one of two shapes:
 *
 * 1. **A handler function** — `(req) => body | rich response | Promise<...>`.
 *    Identity at runtime; gives TypeScript full inference on the response.
 *
 *    ```ts
 *    export default defineMock<User>(({ params }) => ({
 *      id: Number(params.id),
 *      name: 'Ada',
 *    }));
 *    ```
 *
 * 2. **A scenarios map** — `{ default, [name]: ... }` for multiple named
 *    response variants. The `default` key is required. Active variant is
 *    picked per request via `?apitemkin_scenario=<name>`. Each value can
 *    be a plain body, a `RichResponse`, or a handler function.
 *
 *    ```ts
 *    export default defineMock<User[]>({
 *      default: [{ id: 1, name: 'Ada' }],
 *      empty:   [],
 *      error:   { status: 500, body: { error: 'oops' } },
 *      slow:    { delay: 2000, body: [{ id: 1, name: 'Ada' }] },
 *      computed: ({ params }) => [{ id: Number(params.id), name: 'Ada' }],
 *    });
 *    ```
 */
export function defineMock<TBody = unknown>(
  handler: ApitemkinHandler<TBody>,
): ApitemkinHandler<TBody>;
export function defineMock<TBody = unknown>(
  scenarios: ScenariosMap<TBody>,
): ScenariosHandler<TBody>;
export function defineMock<TBody = unknown>(
  arg: ApitemkinHandler<TBody> | ScenariosMap<TBody>,
): ApitemkinHandler<TBody> {
  if (typeof arg === 'function') {
    return arg;
  }

  const scenarios = arg;
  const handler = (async (req: ApitemkinRequest) => {
    const requested = extractScenario(req.url);
    let chosen: ScenarioValue<TBody>;

    if (
      requested &&
      Object.prototype.hasOwnProperty.call(scenarios, requested)
    ) {
      chosen = scenarios[requested]!;
    } else {
      if (requested) {
        console.warn(
          `apitemkin: scenario '${requested}' not defined for ${req.method} ${req.url}, falling back to default`,
        );
      }
      chosen = scenarios.default;
    }

    if (typeof chosen === 'function') {
      return (chosen as ApitemkinHandler<TBody>)(req);
    }
    return chosen;
  }) as ScenariosHandler<TBody>;

  handler.__apitemkin_scenarios = Object.keys(scenarios);
  return handler;
}
