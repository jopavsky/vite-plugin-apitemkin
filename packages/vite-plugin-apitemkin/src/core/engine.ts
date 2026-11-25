import { readFile } from 'node:fs/promises';
import type { IncomingMessage, ServerResponse } from 'node:http';
import {
  scanDataFiles,
  scanMocks,
  type DataFile,
  type HttpMethod,
  type MockRoute,
  type MockRouteKind,
} from './scanner.js';
import { matchRoute } from './matcher.js';
import { BAD_REQUEST, invokeHandler, sleep, type ModuleLoader } from './runtime.js';
import { internalsOf, isCollection, USAGE_ERROR } from './collection.js';

export interface EngineOptions {
  mocksDir: string;          // absolute path
  urlPrefix: string;         // e.g. '/api' or ''
  delay: number;             // global delay in ms
  loadModule: ModuleLoader;
  /** When true, unmatched URLs under urlPrefix return false instead of a 404. Default false. */
  fallthrough?: boolean;
  /** Where collection load errors and `_data.json` warnings go. Messages start with `apitemkin:`. */
  log?: { warn(msg: string): void; error(msg: string): void };
}

/** One collection export, for GET /_apitemkin/collections. */
export interface CollectionEntry {
  /** Export name. */
  name: string;
  /** Data file relative to mocksDir, `/` separators. */
  file: string;
  /** Folder URL the overlay groups it under. */
  url: string;
  count: number;
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
  /** Every collection export in the scanned data files. Files that fail to load are skipped. */
  collections(): Promise<CollectionEntry[]>;
  /** Reset one collection to its seed; null when no such file/export. */
  resetCollection(file: string, name: string): Promise<CollectionEntry | null>;
}

export function createMockEngine(options: EngineOptions): MockEngine {
  const {
    mocksDir,
    urlPrefix,
    delay: globalDelay,
    loadModule,
    fallthrough = false,
    log,
  } = options;
  let routes: MockRoute[] = [];
  let dataFiles: DataFile[] = [];
  let generation = 0;
  /** The rescan whose data files were last loaded; -1 = never. */
  let loadedGeneration = -1;
  const warnedJson = new Set<string>();

  /**
   * Data modules load on first use (first request or overlay call) after each
   * rescan, never inside rescan: at startup that would run before Vite and
   * other plugins finish setting up. Load errors are reported once per rescan.
   */
  function collectionsFirstUse(): Promise<CollectionEntry[]> {
    const report = loadedGeneration !== generation;
    loadedGeneration = generation;
    return loadCollections(report);
  }

  /** Load every data module, name its collections, and list them. */
  async function loadCollections(report: boolean): Promise<CollectionEntry[]> {
    const out: CollectionEntry[] = [];
    for (const data of dataFiles) {
      if (data.json) continue;
      let mod: Record<string, unknown>;
      try {
        mod = await loadModule(data.filePath);
      } catch (err) {
        if (report) {
          log?.error(
            `apitemkin: failed to load collection file ${data.file}: ${(err as Error).message}`,
          );
        }
        continue;
      }
      for (const [name, value] of Object.entries(mod)) {
        if (!isCollection(value)) continue;
        const internals = internalsOf(value);
        internals.name = name;
        out.push({ name, file: data.file, url: data.url, count: internals.count() });
      }
    }
    return out;
  }

  return {
    async rescan() {
      const mine = ++generation;
      const [scanned, data] = await Promise.all([
        scanMocks(mocksDir, urlPrefix),
        scanDataFiles(mocksDir, urlPrefix),
      ]);
      // A newer rescan started meanwhile; its result (or the last good table) wins.
      if (mine !== generation) return;
      routes = scanned;
      dataFiles = data;
      for (const d of data) {
        if (!d.json || warnedJson.has(d.file)) continue;
        warnedJson.add(d.file);
        log?.warn(
          `apitemkin: ${d.file} ignored. JSON collection files are not supported yet; use a _data.ts file with defineCollection.`,
        );
      }
    },

    collections() {
      return collectionsFirstUse();
    },

    async resetCollection(file, name) {
      const data = dataFiles.find((d) => d.file === file && !d.json);
      if (!data) return null;
      let mod: Record<string, unknown>;
      try {
        mod = await loadModule(data.filePath);
      } catch {
        return null;
      }
      const value = Object.prototype.hasOwnProperty.call(mod, name) ? mod[name] : undefined;
      if (!isCollection(value)) return null;
      const internals = internalsOf(value);
      internals.reset();
      internals.name = name;
      return { name, file: data.file, url: data.url, count: internals.count() };
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
            // Name collections before the first code route runs, so 404s say "in users".
            if (loadedGeneration !== generation) await collectionsFirstUse();
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
          const e = err as Error & Record<symbol, unknown>;
          // Collection one-liner misuse: say which route file to fix.
          const message =
            e && e[USAGE_ERROR] ? `${e.message}\n  in ${match.route.filePath}` : e.message;
          // A client sent malformed JSON: that's a 400, not a mock failure.
          res.statusCode = e && e[BAD_REQUEST] ? 400 : 500;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ error: message }));
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
