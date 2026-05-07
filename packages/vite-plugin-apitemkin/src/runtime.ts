import type { IncomingMessage } from 'node:http';
import type { ViteDevServer } from 'vite';
import type { MockRoute } from './scanner.js';

export interface ApitemkinRequest<TBody = unknown> {
  method: string;
  url: string;
  params: Record<string, string>;
  query: Record<string, string | string[]>;
  body: TBody;
  headers: Record<string, string | string[] | undefined>;
}

export interface RichResponse<TBody = unknown> {
  status?: number;
  headers?: Record<string, string>;
  body: TBody;
  /** Override the plugin's global delay for this response. Milliseconds. */
  delay?: number;
}

export type ApitemkinHandler<TBody = unknown> = (
  req: ApitemkinRequest,
) => TBody | RichResponse<TBody> | Promise<TBody | RichResponse<TBody>>;

/**
 * One variant inside a scenarios map. Can be a plain body, a `RichResponse`,
 * or an `ApitemkinHandler` function.
 */
export type ScenarioValue<TBody = unknown> =
  | TBody
  | RichResponse<TBody>
  | ApitemkinHandler<TBody>;

/**
 * Scenarios map passed to {@link defineMock} for routes with multiple variants.
 * The `default` key is required; other names are user-defined.
 */
export interface ScenariosMap<TBody = unknown> {
  default: ScenarioValue<TBody>;
  [name: string]: ScenarioValue<TBody>;
}

/**
 * Handler returned by `defineMock(scenarios)` — same shape as
 * {@link ApitemkinHandler} plus a `__apitemkin_scenarios` metadata array
 * (used by the `/_apitemkin/scenarios` discovery endpoint).
 */
export interface ScenariosHandler<TBody = unknown>
  extends ApitemkinHandler<TBody> {
  __apitemkin_scenarios: string[];
}

export async function readJsonBody(req: IncomingMessage): Promise<unknown> {
  const ct = req.headers['content-type'];
  if (!ct || !ct.toLowerCase().includes('application/json')) return undefined;

  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
  }
  const text = Buffer.concat(chunks).toString('utf8');
  if (!text.trim()) return undefined;
  return JSON.parse(text);
}

export function parseQuery(url: string): Record<string, string | string[]> {
  const queryStart = url.indexOf('?');
  if (queryStart === -1) return {};
  const queryStr = url.slice(queryStart + 1).split('#')[0]!;
  const params = new URLSearchParams(queryStr);
  const out: Record<string, string | string[]> = {};
  for (const key of new Set(params.keys())) {
    const all = params.getAll(key);
    out[key] = all.length === 1 ? all[0]! : all;
  }
  return out;
}

export function isRichResponse(v: unknown): v is RichResponse {
  if (typeof v !== 'object' || v === null || Array.isArray(v)) return false;
  if (!('body' in v)) return false;
  // Require status, headers, or delay to disambiguate from a plain body that happens to have a `body` key.
  return 'status' in v || 'headers' in v || 'delay' in v;
}

export interface NormalizedResponse {
  status: number;
  headers: Record<string, string>;
  body: unknown;
  delay?: number;
}

export async function invokeHandler(
  server: ViteDevServer,
  route: MockRoute,
  req: IncomingMessage,
  params: Record<string, string>,
): Promise<NormalizedResponse> {
  const mod = await server.ssrLoadModule(route.filePath);
  const handler = (mod as { default?: unknown }).default;
  if (typeof handler !== 'function') {
    throw new Error(
      `apitemkin: ${route.filePath} must default-export a handler function`,
    );
  }

  const body = await readJsonBody(req);
  const fullQuery = parseQuery(req.url ?? '');
  // Strip apitemkin_scenario so handlers don't see it as an app-level query.
  // The scenarios overload of defineMock parses it from req.url directly.
  const query: Record<string, string | string[]> = {};
  for (const [k, v] of Object.entries(fullQuery)) {
    if (k !== 'apitemkin_scenario') query[k] = v;
  }
  const context: ApitemkinRequest = {
    method: req.method ?? 'GET',
    url: req.url ?? '',
    params,
    query,
    body,
    headers: req.headers,
  };

  const result = await (handler as ApitemkinHandler)(context);

  if (isRichResponse(result)) {
    return {
      status: result.status ?? 200,
      headers: result.headers ?? {},
      body: result.body,
      delay: result.delay,
    };
  }
  return { status: 200, headers: {}, body: result };
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Recursive partial type. Plain object branches become optional and partial
 * at every depth; arrays and primitive leaves are kept as-is (since the
 * deep-merge replaces arrays wholesale rather than recursing into them).
 */
export type DeepPartial<T> = T extends Array<unknown>
  ? T
  : T extends object
    ? { [K in keyof T]?: DeepPartial<T[K]> }
    : T;

function isPlainObject(v: unknown): v is Record<string, unknown> {
  if (typeof v !== 'object' || v === null || Array.isArray(v)) return false;
  const proto = Object.getPrototypeOf(v);
  return proto === Object.prototype || proto === null;
}

function deepMerge<T>(base: T, patch: DeepPartial<T>): T {
  if (!isPlainObject(base) || !isPlainObject(patch)) {
    return patch as T;
  }
  const result: Record<string, unknown> = { ...base };
  for (const [key, patchVal] of Object.entries(patch)) {
    if (patchVal === undefined) continue;
    const baseVal = (base as Record<string, unknown>)[key];
    result[key] =
      isPlainObject(baseVal) && isPlainObject(patchVal)
        ? deepMerge(baseVal, patchVal as DeepPartial<typeof baseVal>)
        : patchVal;
  }
  return result as T;
}

/**
 * Build a partial-override variant of a base response body. Returns a fresh
 * deep-merged copy: nested plain objects merge recursively; arrays, `null`,
 * primitives, and class instances replace wholesale; `undefined` patch values
 * preserve the base. Inputs are never mutated.
 *
 * Designed to pair with `defineMock(scenariosMap)` — the result is a plain
 * `T`, so it slots into any `ScenarioValue` position.
 *
 * ```ts
 * const baseUser = { id: 1, name: 'Ada', address: { city: 'London' } };
 * defineMock<User>({
 *   default:    baseUser,
 *   inParis:    defineOverride(baseUser, { address: { city: 'Paris' } }),
 *   unverified: defineOverride(baseUser, { verified: false }),
 * });
 * ```
 *
 * For shallow merges, native `{ ...base, ...patch }` is the right tool —
 * `defineOverride` earns its keep when nesting is involved.
 */
export function defineOverride<T>(base: T, patch: DeepPartial<T>): T {
  return deepMerge(base, patch);
}
