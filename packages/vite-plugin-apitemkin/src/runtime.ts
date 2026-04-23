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
  const query = parseQuery(req.url ?? '');
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
