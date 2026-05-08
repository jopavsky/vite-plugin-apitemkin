import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createServer, type ViteDevServer } from 'vite';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import apitemkin from '../src/index.js';

let root: string;

async function write(rel: string, content: string): Promise<void> {
  const full = join(root, rel);
  await mkdir(dirname(full), { recursive: true });
  await writeFile(full, content, 'utf8');
}

async function makeServer(devtools: boolean): Promise<{
  server: ViteDevServer;
  baseUrl: string;
}> {
  const server = await createServer({
    root,
    server: { port: 0 },
    plugins: [apitemkin({ delay: 0, devtools })],
    logLevel: 'silent',
  });
  await server.listen();
  const local = server.resolvedUrls?.local[0];
  if (!local) throw new Error('Vite did not return a local URL');
  return {
    server,
    baseUrl: local.endsWith('/') ? local.slice(0, -1) : local,
  };
}

beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), 'apitemkin-injection-'));
  // Minimal mock so the plugin has a non-empty discovery payload.
  await write('mocks/healthcheck.json', '{"status":"ok"}');
  await write(
    'index.html',
    '<!doctype html><html><head><title>t</title></head><body><div id="app"></div></body></html>',
  );
}, 30_000);

afterAll(async () => {
  if (root) await rm(root, { recursive: true, force: true });
});

describe('devtools overlay injection (default: enabled)', () => {
  let server: ViteDevServer;
  let baseUrl: string;

  beforeAll(async () => {
    ({ server, baseUrl } = await makeServer(true));
  });
  afterAll(async () => {
    await server?.close();
  });

  it('injects a <script type="module" src="/_apitemkin/devtools.js"> tag', async () => {
    const res = await fetch(`${baseUrl}/`);
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain(
      '<script type="module" src="/_apitemkin/devtools.js">',
    );
  });

  it('claims the /_apitemkin/devtools.js URL (does not fall through to HTML)', async () => {
    const res = await fetch(`${baseUrl}/_apitemkin/devtools.js`);
    const ct = res.headers.get('content-type') ?? '';
    // When the package is built (dist/devtools.client.js exists) the endpoint
    // serves application/javascript. When tests run directly from src the
    // bundle isn't on disk yet and the middleware falls back to a 500 + JSON
    // payload pointing at `npm run build`. Either way it's NOT Vite's HTML
    // fallback — that's the regression this test guards against.
    expect(ct).not.toContain('text/html');
    if (res.status === 200) {
      expect(ct).toContain('javascript');
    } else {
      expect(res.status).toBe(500);
      expect(ct).toContain('application/json');
      const body = (await res.json()) as { error: string };
      expect(body.error).toMatch(/devtools client/i);
    }
  });

  it('still serves /_apitemkin/scenarios — not shadowed by the new middleware', async () => {
    const res = await fetch(`${baseUrl}/_apitemkin/scenarios`);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('application/json');
  });
});

describe('devtools overlay injection (devtools: false)', () => {
  let server: ViteDevServer;
  let baseUrl: string;

  beforeAll(async () => {
    ({ server, baseUrl } = await makeServer(false));
  });
  afterAll(async () => {
    await server?.close();
  });

  it('does not inject the overlay <script> tag', async () => {
    const res = await fetch(`${baseUrl}/`);
    const html = await res.text();
    expect(html).not.toContain('/_apitemkin/devtools.js');
  });

  it('lets /_apitemkin/devtools.js fall through to Vite (HTML fallback)', async () => {
    const res = await fetch(`${baseUrl}/_apitemkin/devtools.js`);
    const ct = res.headers.get('content-type') ?? '';
    expect(ct).toContain('text/html');
  });

  it('still exposes the discovery endpoint (gated only on `enabled`)', async () => {
    const res = await fetch(`${baseUrl}/_apitemkin/scenarios`);
    expect(res.status).toBe(200);
  });
});
