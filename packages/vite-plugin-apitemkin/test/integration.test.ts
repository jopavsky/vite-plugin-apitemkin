import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createServer, type ViteDevServer } from 'vite';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import apitemkin from '../src/index.js';

let server: ViteDevServer;
let baseUrl: string;
let root: string;

async function write(rel: string, content: string): Promise<void> {
  const full = join(root, rel);
  await mkdir(dirname(full), { recursive: true });
  await writeFile(full, content, 'utf8');
}

beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), 'apitemkin-int-'));

  await write('mocks/healthcheck.json', '{"status":"ok"}');
  await write('mocks/users/index.json', '[{"id":1},{"id":2}]');
  await write('mocks/users/index.post.json', '{"created":true}');
  await write('mocks/users/[id].json', '{"id":42,"name":"Ada"}');
  await write(
    'index.html',
    '<!doctype html><html><body><div id="app"></div></body></html>',
  );

  server = await createServer({
    root,
    server: { port: 0 },
    plugins: [apitemkin()],
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

describe('apitemkin integration with Vite dev server', () => {
  it('serves a flat mock file as JSON with the right Content-Type', async () => {
    const res = await fetch(`${baseUrl}/api/healthcheck`);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('application/json');
    expect(await res.json()).toEqual({ status: 'ok' });
  });

  it('serves an index.json mock for the folder URL', async () => {
    const res = await fetch(`${baseUrl}/api/users`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([{ id: 1 }, { id: 2 }]);
  });

  it('serves an index.post.json mock for POST on the same URL', async () => {
    const res = await fetch(`${baseUrl}/api/users`, { method: 'POST' });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ created: true });
  });

  it('serves a [id].json mock for any param value', async () => {
    const res = await fetch(`${baseUrl}/api/users/123`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ id: 42, name: 'Ada' });
  });

  it('returns 404 JSON for an unmatched URL under the API prefix', async () => {
    const res = await fetch(`${baseUrl}/api/does-not-exist`);
    expect(res.status).toBe(404);
    expect(res.headers.get('content-type')).toContain('application/json');
    const body = (await res.json()) as { error: string };
    expect(body.error).toMatch(/No mock for GET \/api\/does-not-exist/);
  });

  it('returns 404 JSON for wrong-method requests', async () => {
    const res = await fetch(`${baseUrl}/api/healthcheck`, { method: 'DELETE' });
    expect(res.status).toBe(404);
  });

  it('does not intercept URLs outside the API prefix', async () => {
    const res = await fetch(`${baseUrl}/index.html`);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/html');
  });

  it('strips query strings before matching', async () => {
    const res = await fetch(`${baseUrl}/api/users?page=2&limit=10`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([{ id: 1 }, { id: 2 }]);
  });
});
