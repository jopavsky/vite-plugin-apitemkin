import { readFile } from 'node:fs/promises';
import { isAbsolute, relative, resolve } from 'node:path';
import type { Plugin, ResolvedConfig, ViteDevServer } from 'vite';
import { scanMocks, type MockRoute } from './scanner.js';
import { matchRoute } from './matcher.js';
import { invokeHandler, type ApitemkinHandler } from './runtime.js';

export interface ApitemkinOptions {
  enabled?: boolean;
  mocksDir?: string;
  urlPrefix?: string;
}

export default function apitemkin(options: ApitemkinOptions = {}): Plugin {
  const { enabled = true, mocksDir = 'mocks', urlPrefix = '/api' } = options;

  let resolvedMocksDir = '';
  let routes: MockRoute[] = [];

  return {
    name: 'vite-plugin-apitemkin',
    apply: 'serve',

    configResolved(config: ResolvedConfig) {
      if (!enabled) return;
      resolvedMocksDir = resolve(config.root, mocksDir);
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

      server.middlewares.use(async (req, res, next) => {
        if (!req.url || !req.method) return next();

        const match = matchRoute(routes, req.method, req.url, urlPrefix);
        if (match) {
          try {
            if (match.route.kind === 'json') {
              const body = await readFile(match.route.filePath, 'utf8');
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
export type {
  ApitemkinHandler,
  ApitemkinRequest,
  RichResponse,
} from './runtime.js';

/**
 * Identity helper that gives TypeScript users full type inference on a mock
 * handler's response and request shape. Wrapping is optional but recommended.
 *
 * @example
 * export default defineMock<User>(({ params }) => ({
 *   id: Number(params.id),
 *   name: 'Ada',
 * }));
 */
export function defineMock<TBody = unknown>(
  handler: ApitemkinHandler<TBody>,
): ApitemkinHandler<TBody> {
  return handler;
}
