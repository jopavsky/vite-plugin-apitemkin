import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createServer, type ViteDevServer } from 'vite';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import apitemkin from '../src/index.js';

let server: ViteDevServer;
let baseUrl: string;
let root: string;

const GLOBAL_DELAY = 80;
const TOLERANCE = 30; // setTimeout / event-loop slack — be generous on Windows.

async function write(rel: string, content: string): Promise<void> {
  const full = join(root, rel);
  await mkdir(dirname(full), { recursive: true });
  await writeFile(full, content, 'utf8');
}

async function timed<T>(fn: () => Promise<T>): Promise<{ ms: number; value: T }> {
  const start = Date.now();
  const value = await fn();
  return { ms: Date.now() - start, value };
}

beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), 'apitemkin-delay-'));

  await write('mocks/healthcheck.json', '{"status":"ok"}');
  await write(
    'mocks/whoami.ts',
    `export default ({ method }: any) => ({ method });`,
  );
  await write(
    'mocks/slow.ts',
    `export default () => ({ delay: 200, body: { slow: true } });`,
  );
  await write(
    'mocks/fast.ts',
    `export default () => ({ delay: 0, body: { fast: true } });`,
  );
  await write(
    'index.html',
    '<!doctype html><html><body></body></html>',
  );

  server = await createServer({
    root,
    server: { port: 0 },
    plugins: [apitemkin({ delay: GLOBAL_DELAY })],
    logLevel: 'error',
  });
  await server.listen();
  const local = server.resolvedUrls?.local[0];
  if (!local) throw new Error('Vite did not return a local URL');
  baseUrl = local.endsWith('/') ? local.slice(0, -1) : local;
}, 30_000);

afterAll(async () => {
  await server?.close();
  if (root) await rm(root, { recursive: true, force: true });
});

describe('apitemkin delay', () => {
  it('applies the global delay to JSON mock responses', async () => {
    const { ms, value } = await timed(() =>
      fetch(`${baseUrl}/api/healthcheck`),
    );
    expect(value.status).toBe(200);
    expect(ms).toBeGreaterThanOrEqual(GLOBAL_DELAY - TOLERANCE);
  });

  it('applies the global delay to code mock responses', async () => {
    const { ms, value } = await timed(() =>
      fetch(`${baseUrl}/api/whoami`),
    );
    expect(value.status).toBe(200);
    expect(ms).toBeGreaterThanOrEqual(GLOBAL_DELAY - TOLERANCE);
  });

  it('lets a handler override the global delay with a longer one', async () => {
    const { ms, value } = await timed(() => fetch(`${baseUrl}/api/slow`));
    expect(value.status).toBe(200);
    expect(await value.json()).toEqual({ slow: true });
    expect(ms).toBeGreaterThanOrEqual(200 - TOLERANCE);
  });

  it('lets a handler opt out of the delay with delay: 0', async () => {
    const { ms, value } = await timed(() => fetch(`${baseUrl}/api/fast`));
    expect(value.status).toBe(200);
    expect(await value.json()).toEqual({ fast: true });
    expect(ms).toBeLessThan(GLOBAL_DELAY);
  });
});
