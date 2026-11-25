// Real Vite dev server: proves the approach the 1.5 design relies on (spec §5.2 A).
// One shared module instance between route files and the engine; editing a
// route keeps the data; saving the data file re-seeds it.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createServer, type ViteDevServer } from 'vite';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import apitemkin from '../src/index.js';

const src = (rel: string) =>
  fileURLToPath(new URL(`../src/${rel}`, import.meta.url)).replace(/\\/g, '/');
const COLLECTION_SRC = src('core/collection.ts');
const DEFINE_MOCK_SRC = src('core/define-mock.ts');

let server: ViteDevServer;
let baseUrl: string;
let root: string;

async function write(rel: string, content: string): Promise<void> {
  const full = join(root, rel);
  await mkdir(dirname(full), { recursive: true });
  await writeFile(full, content, 'utf8');
}

async function poll(
  url: string,
  predicate: (res: Response) => boolean | Promise<boolean>,
  timeoutMs = 30_000,
): Promise<Response> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const res = await fetch(url);
    if (await predicate(res.clone())) return res;
    await new Promise((r) => setTimeout(r, 50));
  }
  throw new Error(`Timed out polling ${url}`);
}

const dataFile = (ids: number[]) =>
  `import { defineCollection } from '${COLLECTION_SRC}';\n` +
  `export const users = defineCollection(${JSON.stringify(ids.map((id) => ({ id })))});\n`;

const postJson = (path: string, body: unknown) =>
  fetch(`${baseUrl}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

const ids = async (res: Response) => ((await res.json()) as { id: number }[]).map((u) => u.id);

beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), 'apitemkin-coll-vite-'));
  await write('index.html', '<!doctype html><html><body></body></html>');
  await write('mocks/users/_data.ts', dataFile([1, 2]));
  await write(
    'mocks/users/index.ts',
    `import { users } from './_data';\nexport default users.list();\n`,
  );
  await write(
    'mocks/users/index.post.ts',
    `import { users } from './_data';\nexport default users.create();\n`,
  );

  server = await createServer({
    root,
    server: { port: 0, watch: { usePolling: true, interval: 100 } },
    plugins: [apitemkin({ delay: 0, devtools: false })],
    logLevel: 'silent',
  });
  await server.listen();
  const local = server.resolvedUrls?.local[0];
  if (!local) throw new Error('Vite did not return a local URL');
  baseUrl = local.endsWith('/') ? local.slice(0, -1) : local;
}, 60_000);

afterAll(async () => {
  await server?.close();
  if (root) await rm(root, { recursive: true, force: true });
});

describe('collections on a real Vite dev server', () => {
  it('route files share one in-memory list', async () => {
    expect((await postJson('/api/users', { name: 'C' })).status).toBe(201);
    expect(await ids(await fetch(`${baseUrl}/api/users`))).toEqual([1, 2, 3]);
  });

  it('editing a route file keeps the data', async () => {
    await write(
      'mocks/users/index.ts',
      `import { defineMock } from '${DEFINE_MOCK_SRC}';\n` +
        `import { users } from './_data';\n` +
        `export default defineMock(() => ({ status: 200, headers: { 'x-v': '2' }, body: users.all() }));\n`,
    );
    const res = await poll(`${baseUrl}/api/users`, (r) => r.headers.get('x-v') === '2');
    expect(await ids(res)).toEqual([1, 2, 3]);
  });

  it('saving the data file re-seeds', async () => {
    await write('mocks/users/_data.ts', dataFile([10, 20, 30]));
    await poll(`${baseUrl}/api/users`, async (r) => (await ids(r)).join() === '10,20,30');
    expect((await postJson('/api/users', {})).status).toBe(201);
    expect(await ids(await fetch(`${baseUrl}/api/users`))).toEqual([10, 20, 30, 31]);
  });

  it('GET /_apitemkin/collections reports the count', async () => {
    const res = await fetch(`${baseUrl}/_apitemkin/collections`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      urlPrefix: '/api',
      collections: [{ name: 'users', file: 'users/_data.ts', url: '/api/users', count: 4 }],
    });
  });

  it('POST /_apitemkin/collections/reset restores the seed', async () => {
    const res = await postJson('/_apitemkin/collections/reset', {
      file: 'users/_data.ts',
      name: 'users',
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ name: 'users', count: 3 });
    expect(await ids(await fetch(`${baseUrl}/api/users`))).toEqual([10, 20, 30]);
  });

  it('reset rejects bad input', async () => {
    const unknown = await postJson('/_apitemkin/collections/reset', {
      file: 'users/_data.ts',
      name: 'nope',
    });
    expect(unknown.status).toBe(404);
    expect((await postJson('/_apitemkin/collections/reset', {})).status).toBe(400);
  });

  it('reset without a JSON Content-Type says which header is missing', async () => {
    const res = await fetch(`${baseUrl}/_apitemkin/collections/reset`, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: JSON.stringify({ file: 'users/_data.ts', name: 'users' }),
    });
    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: string }).error).toContain('Content-Type: application/json');
  });

  it('data files are never served as routes', async () => {
    const res = await fetch(`${baseUrl}/api/users/_data`);
    expect(res.status).toBe(404);
  });
});
