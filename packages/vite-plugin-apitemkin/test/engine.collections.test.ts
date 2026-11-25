import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createMockEngine, type MockEngine } from '../src/core/engine.js';

// Fixtures import the real source; vitest's module runner transforms the TS.
const collectionSrc = fileURLToPath(new URL('../src/core/collection.ts', import.meta.url)).replace(/\\/g, '/');
const importLine = `import { defineCollection } from '${collectionSrc}';`;

let root: string;
let mocksDir: string;
let engine: MockEngine;
let server: Server;
let baseUrl: string;
const log = { warn: vi.fn(), error: vi.fn() };

async function write(rel: string, content: string): Promise<void> {
  const full = join(mocksDir, rel);
  await mkdir(dirname(full), { recursive: true });
  await writeFile(full, content, 'utf8');
}

const post = (path: string, body: unknown) =>
  fetch(`${baseUrl}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), 'apitemkin-engine-coll-'));
  mocksDir = join(root, 'mocks');
  await write(
    'users/_data.mjs',
    `${importLine}\nexport const users = defineCollection([{ id: 1 }, { id: 2 }]);\nexport const other = 5;\n`,
  );
  await write(
    'users/index.post.mjs',
    `import { users } from './_data.mjs';\nexport default users.create();\n`,
  );
  await write(
    'users/[id].mjs',
    `import { users } from './_data.mjs';\nexport default users.get();\n`,
  );
  await write(
    'admin/users/_data.mjs',
    `${importLine}\nexport const users = defineCollection([{ id: 1 }]);\n`,
  );
  await write(
    'bad/index.mjs',
    `import { users } from '../users/_data.mjs';\nexport default users.get();\n`,
  );
  await write('boom/index.mjs', `export default () => { throw new Error('plain failure'); };\n`);
  await write('broken/_data.mjs', `throw new Error('top-level boom');\n`);
  await write('legacy/_data.json', '[]');

  engine = createMockEngine({
    mocksDir,
    urlPrefix: '/api',
    delay: 0,
    log,
    // Plain path, not a file URL: the runner doesn't decode %5Bid%5D back to [id].
    loadModule: (p) => import(/* @vite-ignore */ p.replace(/\\/g, '/')),
  });
  await engine.rescan();

  server = createServer(async (req, res) => {
    if (!(await engine.handle(req, res))) {
      res.statusCode = 599;
      res.end();
    }
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  baseUrl = `http://127.0.0.1:${port}`;
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
  await rm(root, { recursive: true, force: true });
});

describe('engine collections', () => {
  it('collections() lists every collection export with folder url and count', async () => {
    expect(await engine.collections()).toEqual([
      { name: 'users', file: 'admin/users/_data.mjs', url: '/api/admin/users', count: 1 },
      { name: 'users', file: 'users/_data.mjs', url: '/api/users', count: 2 },
    ]);
  });

  it('a broken data file is logged once per rescan, naming the file', () => {
    const calls = log.error.mock.calls.filter(([m]) => String(m).includes('broken/_data.mjs'));
    expect(calls).toHaveLength(1);
    expect(calls[0]![0]).toContain('top-level boom');
  });

  it('_data.json is warned about once', async () => {
    await engine.rescan();
    const calls = log.warn.mock.calls.filter(([m]) => String(m).includes('legacy/_data.json'));
    expect(calls).toHaveLength(1);
    expect(calls[0]![0]).toContain('not supported yet');
  });

  it('data files are not routes', async () => {
    expect(engine.routes().some((r) => r.filePath.includes('_data.'))).toBe(false);
  });

  it('POST through the route changes the count', async () => {
    const res = await post('/api/users', {});
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ id: 3 });
    const entry = (await engine.collections()).find((e) => e.file === 'users/_data.mjs');
    expect(entry!.count).toBe(3);
  });

  it('resetCollection resets only the named file', async () => {
    expect(await engine.resetCollection('users/_data.mjs', 'users')).toEqual({
      name: 'users',
      file: 'users/_data.mjs',
      url: '/api/users',
      count: 2,
    });
    const admin = (await engine.collections()).find((e) => e.file === 'admin/users/_data.mjs');
    expect(admin!.count).toBe(1);
  });

  it('resetCollection returns null for an unknown file or name', async () => {
    expect(await engine.resetCollection('nope/_data.mjs', 'users')).toBeNull();
    expect(await engine.resetCollection('users/_data.mjs', 'other')).toBeNull();
    expect(await engine.resetCollection('users/_data.mjs', 'missing')).toBeNull();
    expect(await engine.resetCollection('legacy/_data.json', 'users')).toBeNull();
  });

  it('names are set so 404 messages say which collection', async () => {
    const res = await fetch(`${baseUrl}/api/users/9`);
    expect({ status: res.status, body: await res.json() }).toEqual({
      status: 404,
      body: { error: 'No record with id 9 in users' },
    });
  });

  it('usage errors name the route file', async () => {
    const res = await fetch(`${baseUrl}/api/bad`);
    expect(res.status).toBe(500);
    const { error } = (await res.json()) as { error: string };
    expect(error).toContain('get() needs a URL param');
    expect(error).toContain(`bad${sep}index.mjs`);
  });

  it('other handler errors are unchanged', async () => {
    const res = await fetch(`${baseUrl}/api/boom`);
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: 'plain failure' });
  });

  it('a malformed JSON body is a 400 that says so, and stores nothing', async () => {
    const before = (await engine.collections()).find((e) => e.file === 'users/_data.mjs')!.count;
    const res = await fetch(`${baseUrl}/api/users`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{bad',
    });
    expect(res.status).toBe(400);
    const { error } = (await res.json()) as { error: string };
    expect(error).toContain('Request body is not valid JSON');
    expect((await engine.collections()).find((e) => e.file === 'users/_data.mjs')!.count).toBe(before);
  });
});

describe('engine collections: load timing', () => {
  it('rescan does not load data modules; they load on first use', async () => {
    const loadModule = vi.fn((p: string) => import(/* @vite-ignore */ p.replace(/\\/g, '/')));
    const lazy = createMockEngine({ mocksDir, urlPrefix: '/api', delay: 0, log: { warn() {}, error() {} }, loadModule });
    await lazy.rescan();
    expect(loadModule.mock.calls.some(([p]) => String(p).includes('_data.'))).toBe(false);
    await lazy.collections();
    expect(loadModule.mock.calls.some(([p]) => String(p).includes('_data.'))).toBe(true);
  });

  it('a broken data file is reported on first use, once per rescan', async () => {
    const error = vi.fn();
    const lazy = createMockEngine({
      mocksDir,
      urlPrefix: '/api',
      delay: 0,
      log: { warn() {}, error },
      loadModule: (p) => import(/* @vite-ignore */ p.replace(/\\/g, '/')),
    });
    await lazy.rescan();
    expect(error).not.toHaveBeenCalled();
    await lazy.collections();
    await lazy.collections();
    expect(error.mock.calls.filter(([m]) => String(m).includes('broken/_data.mjs'))).toHaveLength(1);
    await lazy.rescan();
    await lazy.collections();
    expect(error.mock.calls.filter(([m]) => String(m).includes('broken/_data.mjs'))).toHaveLength(2);
  });
});
