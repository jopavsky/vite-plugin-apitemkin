import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { createServer as createHttpServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer, createLogger, type InlineConfig, type ViteDevServer } from 'vite';
import apitemkin from '../src/index.js';

let root: string;
let backend: Server;
let a: string;
let b: string;
let c: string;
const servers: ViteDevServer[] = [];

const loggerA = createLogger('warn');
const warnA = vi.spyOn(loggerA, 'warn').mockImplementation(() => {});
const loggerC = createLogger('warn');
const warnC = vi.spyOn(loggerC, 'warn').mockImplementation(() => {});
const loggerD = createLogger('warn');
const warnD = vi.spyOn(loggerD, 'warn').mockImplementation(() => {});

async function start(config: InlineConfig): Promise<string> {
  const s = await createServer({
    root,
    configFile: false,
    logLevel: 'silent',
    ...config,
    server: { port: 0, host: '127.0.0.1', ...config.server },
  });
  await s.listen();
  servers.push(s);
  return `http://127.0.0.1:${(s.httpServer!.address() as AddressInfo).port}`;
}

beforeAll(async () => {
  backend = createHttpServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on('data', (d: Buffer) => chunks.push(d));
    req.on('end', () => {
      res.setHeader('content-type', 'application/json');
      res.end(
        JSON.stringify({
          from: 'backend',
          method: req.method,
          url: req.url,
          body: Buffer.concat(chunks).toString('utf8'),
        }),
      );
    });
  });
  await new Promise<void>((r) => backend.listen(0, '127.0.0.1', r));
  const backendPort = (backend.address() as AddressInfo).port;

  root = await mkdtemp(join(tmpdir(), 'apitemkin-fallthrough-'));
  await mkdir(join(root, 'mocks'), { recursive: true });
  await writeFile(join(root, 'mocks', 'healthcheck.json'), '{"status":"ok"}');
  await writeFile(join(root, 'index.html'), '<html><body>app</body></html>');

  const proxy = { '/api': `http://127.0.0.1:${backendPort}` };
  a = await start({
    customLogger: loggerA,
    plugins: [apitemkin({ delay: 0, devtools: false, fallthrough: true })],
    server: { proxy },
  });
  b = await start({
    plugins: [apitemkin({ delay: 0, devtools: false })],
    server: { proxy },
  });
  c = await start({
    customLogger: loggerC,
    plugins: [apitemkin({ delay: 0, devtools: false, fallthrough: true })],
  });
  await start({
    customLogger: loggerD,
    plugins: [
      apitemkin({ delay: 0, devtools: false, fallthrough: true, urlPrefix: '' }),
    ],
  });
});

afterAll(async () => {
  await Promise.all(servers.map((s) => s.close()));
  await new Promise<void>((r) => backend.close(() => r()));
  await rm(root, { recursive: true, force: true });
});

describe('fallthrough', () => {
  it('A: unmatched URL reaches the backend', async () => {
    const r = await fetch(`${a}/api/unmocked`);
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({
      from: 'backend',
      method: 'GET',
      url: '/api/unmocked',
      body: '',
    });
  });
  it('A: mocked URL is still served by the mock', async () => {
    expect(await (await fetch(`${a}/api/healthcheck`)).json()).toEqual({
      status: 'ok',
    });
  });
  it('A: mocked URL with an unmocked method reaches the backend', async () => {
    const r = await fetch(`${a}/api/healthcheck`, { method: 'POST' });
    expect(await r.json()).toMatchObject({ from: 'backend', method: 'POST' });
  });
  it('A: a fall-through POST with a JSON body reaches the backend intact', async () => {
    const payload = { name: 'ada', n: [1, 2, 3] };
    const r = await fetch(`${a}/api/unmocked`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const echoed = (await r.json()) as { from: string; body: string };
    expect(echoed.from).toBe('backend');
    expect(JSON.parse(echoed.body)).toEqual(payload);
  });
  it('D: no warning for urlPrefix "" with fallthrough and no proxy', () => {
    const calls = warnD.mock.calls.filter(([m]) =>
      String(m).startsWith('apitemkin: fallthrough is on'),
    );
    expect(calls).toHaveLength(0);
  });
  it('B: default still claims the prefix with a JSON 404', async () => {
    const r = await fetch(`${b}/api/unmocked`);
    expect(r.status).toBe(404);
    expect(await r.json()).toEqual({ error: 'No mock for GET /api/unmocked' });
  });
  it('C: warns once at startup when no proxy is configured, and does not crash', async () => {
    const calls = warnC.mock.calls.filter(([m]) =>
      String(m).startsWith('apitemkin: fallthrough is on'),
    );
    expect(calls).toHaveLength(1);
    const r = await fetch(`${c}/api/unmocked`);
    expect(r.status).toBeLessThan(500);
  });
  it('A: no fallthrough warning when a proxy is configured', () => {
    const calls = warnA.mock.calls.filter(([m]) =>
      String(m).startsWith('apitemkin: fallthrough is on'),
    );
    expect(calls).toHaveLength(0);
  });
});
