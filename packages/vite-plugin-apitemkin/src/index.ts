import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { Plugin, ResolvedConfig, ViteDevServer } from 'vite';
import { scanMocks, type MockRoute } from './scanner.js';
import { matchRoute } from './matcher.js';

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

      try {
        routes = await scanMocks(resolvedMocksDir, urlPrefix);
      } catch (err) {
        server.config.logger.error(`apitemkin: ${(err as Error).message}`);
        return;
      }

      server.middlewares.use(async (req, res, next) => {
        if (!req.url || !req.method) return next();

        const match = matchRoute(routes, req.method, req.url, urlPrefix);
        if (match) {
          try {
            const body = await readFile(match.route.filePath, 'utf8');
            res.setHeader('Content-Type', 'application/json');
            res.statusCode = 200;
            res.end(body);
          } catch (err) {
            next(err);
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

export { apitemkin };
export { scanMocks } from './scanner.js';
export type { HttpMethod, MockRoute, PathSegment } from './scanner.js';
export { matchRoute } from './matcher.js';
export type { MatchResult } from './matcher.js';
