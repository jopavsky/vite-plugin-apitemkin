import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createMockEngine, type MockEngine } from '../src/core/engine.js';

let root: string;
let mocksDir: string;
let engine: MockEngine;
let server: Server;
let baseUrl: string;

async function write(rel: string, content: string): Promise<void> {
  const full = join(mocksDir, rel);
  await mkdir(dirname(full), { recursive: true });
  await writeFile(full, content, 'utf8');
}

beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), 'apitemkin-engine-'));
  mocksDir = join(root, 'mocks');
  await write('ping.json', '{"pong":true}');
  await write(
    'hello.mjs',
    'export default ({ query }) => ({ hi: query.name ?? null });',
  );

  engine = createMockEngine({
    mocksDir,
    urlPrefix: '/api',
    delay: 0,
    loadModule: (p) => import(pathToFileURL(p).href),
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

describe('createMockEngine on plain node:http', () => {
  it('serves a JSON mock', async () => {
    const res = await fetch(`${baseUrl}/api/ping`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ pong: true });
  });

  it('serves a code mock with query params', async () => {
    const res = await fetch(`${baseUrl}/api/hello?name=ada`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ hi: 'ada' });
  });

  it('claims the prefix with a 404', async () => {
    const res = await fetch(`${baseUrl}/api/nope`);
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: 'No mock for GET /api/nope' });
  });

  it('returns false for requests outside the prefix', async () => {
    const res = await fetch(`${baseUrl}/other`);
    expect(res.status).toBe(599);
  });

  it('lists discovery entries', async () => {
    const entries = await engine.discovery();
    const sorted = [...entries].sort((a, b) => a.url.localeCompare(b.url));
    expect(sorted).toEqual([
      { method: 'GET', url: '/api/hello', kind: 'code', scenarios: [] },
      { method: 'GET', url: '/api/ping', kind: 'json', scenarios: [] },
    ]);
  });

  it('rescan throws on an ambiguous tree and keeps the last good table', async () => {
    const amb = await mkdtemp(join(tmpdir(), 'apitemkin-engine-amb-'));
    try {
      await mkdir(join(amb, 'a'), { recursive: true });
      await writeFile(join(amb, 'ping.json'), '{"pong":true}', 'utf8');
      const e = createMockEngine({
        mocksDir: amb,
        urlPrefix: '/api',
        delay: 0,
        loadModule: (p) => import(pathToFileURL(p).href),
      });
      await e.rescan();
      await writeFile(join(amb, 'a.json'), '{}', 'utf8');
      await writeFile(join(amb, 'a', 'index.json'), '{}', 'utf8');
      await expect(e.rescan()).rejects.toThrow(/ambiguous/);
      expect(e.routes().length).toBe(1);
    } finally {
      await rm(amb, { recursive: true, force: true });
    }
  });

  describe('fallthrough: true', () => {
    let ftServer: Server;
    let ftUrl: string;

    beforeAll(async () => {
      const ft = createMockEngine({
        mocksDir,
        urlPrefix: '/api',
        delay: 0,
        fallthrough: true,
        loadModule: (p) => import(pathToFileURL(p).href),
      });
      await ft.rescan();
      ftServer = createServer(async (req, res) => {
        if (!(await ft.handle(req, res))) {
          res.statusCode = 599;
          res.end();
        }
      });
      await new Promise<void>((r) => ftServer.listen(0, '127.0.0.1', r));
      ftUrl = `http://127.0.0.1:${(ftServer.address() as AddressInfo).port}`;
    });

    afterAll(async () => {
      await new Promise<void>((r) => ftServer.close(() => r()));
    });

    it('returns false for an unmatched URL under the prefix', async () => {
      expect((await fetch(`${ftUrl}/api/nope`)).status).toBe(599);
    });

    it('still serves mocked URLs', async () => {
      expect((await fetch(`${ftUrl}/api/ping`)).status).toBe(200);
    });
  });
});
