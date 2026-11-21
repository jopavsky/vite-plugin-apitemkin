import { readFile } from 'node:fs/promises';
import type { IncomingMessage, ServerResponse } from 'node:http';
import {
  scanMocks,
  type HttpMethod,
  type MockRoute,
  type MockRouteKind,
} from './scanner.js';
import { matchRoute } from './matcher.js';
import { invokeHandler, sleep, type ModuleLoader } from './runtime.js';

export interface EngineOptions {
  mocksDir: string;          // absolute path
  urlPrefix: string;         // e.g. '/api' or ''
  delay: number;             // global delay in ms
  loadModule: ModuleLoader;
  /** When true, unmatched URLs under urlPrefix return false instead of a 404. Default false. */
  fallthrough?: boolean;
}

export interface DiscoveryEntry {
  method: HttpMethod;
  url: string;               // route.urlPattern
  kind: MockRouteKind;
  scenarios: string[];
}

export interface MockEngine {
  /** Rescan mocksDir. On success replaces the route table; on error throws and keeps the last good table. Overlapping rescans: only the latest one applies. */
  rescan(): Promise<void>;
  routes(): readonly MockRoute[];
  /** Serve a mock or the prefix 404. Returns false when the request isn't the engine's (caller calls next()), including unmatched prefix URLs when `fallthrough` is on. */
  handle(req: IncomingMessage, res: ServerResponse): Promise<boolean>;
  /** Entries for GET /_apitemkin/scenarios. Module load errors yield scenarios: []. */
  discovery(): Promise<DiscoveryEntry[]>;
}

export function createMockEngine(options: EngineOptions): MockEngine {
  const {
    mocksDir,
    urlPrefix,
    delay: globalDelay,
    loadModule,
    fallthrough = false,
  } = options;
  let routes: MockRoute[] = [];
  let generation = 0;

  return {
    async rescan() {
      const mine = ++generation;
      const scanned = await scanMocks(mocksDir, urlPrefix);
      // A newer rescan started meanwhile; its result (or the last good table) wins.
      if (mine === generation) routes = scanned;
    },

    routes() {
      return routes;
    },

    async handle(req, res) {
      if (!req.url || !req.method) return false;

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
              loadModule,
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
        return true;
      }

      // Claim the prefix: any unmatched URL under it gets a 404 (not SPA fallback).
      if (!fallthrough && urlPrefix && isUnderPrefix(req.url, urlPrefix)) {
        res.statusCode = 404;
        res.setHeader('Content-Type', 'application/json');
        res.end(
          JSON.stringify({ error: `No mock for ${req.method} ${req.url}` }),
        );
        return true;
      }

      return false;
    },

    async discovery() {
      return Promise.all(
        routes.map(async (route) => {
          let scenarios: string[] = [];
          if (route.kind === 'code') {
            try {
              const mod = await loadModule(route.filePath);
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
    },
  };
}

function isUnderPrefix(url: string, prefix: string): boolean {
  const path = url.split('?')[0]!.split('#')[0]!;
  const norm = prefix.endsWith('/') ? prefix.slice(0, -1) : prefix;
  return path === norm || path.startsWith(norm + '/');
}
