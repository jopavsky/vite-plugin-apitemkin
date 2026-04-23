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

async function pollFetch(
  url: string,
  predicate: (res: Response) => boolean | Promise<boolean>,
  timeoutMs = 5000,
): Promise<Response> {
  const start = Date.now();
  let lastStatus: number | null = null;
  while (Date.now() - start < timeoutMs) {
    const res = await fetch(url);
    if (await predicate(res.clone())) return res;
    lastStatus = res.status;
    await new Promise((r) => setTimeout(r, 50));
  }
  throw new Error(
    `Timed out polling ${url} (last status ${lastStatus ?? '<no response>'})`,
  );
}

beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), 'apitemkin-hmr-'));
  await mkdir(join(root, 'mocks'), { recursive: true });
  await write('index.html', '<!doctype html><html><body></body></html>');

  server = await createServer({
    root,
    server: { port: 0 },
    plugins: [apitemkin({ delay: 0 })],
    logLevel: 'silent',
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

describe('apitemkin HMR for mock changes', () => {
  it('picks up an added mock file without a restart', async () => {
    const before = await fetch(`${baseUrl}/api/added`);
    expect(before.status).toBe(404);

    await write('mocks/added.json', '{"a":1}');

    const after = await pollFetch(
      `${baseUrl}/api/added`,
      (r) => r.status === 200,
    );
    expect(await after.json()).toEqual({ a: 1 });
  });

  it('picks up a deleted mock file without a restart', async () => {
    await write('mocks/willdelete.json', '{"x":true}');
    await pollFetch(
      `${baseUrl}/api/willdelete`,
      (r) => r.status === 200,
    );

    await rm(join(root, 'mocks/willdelete.json'));

    await pollFetch(
      `${baseUrl}/api/willdelete`,
      (r) => r.status === 404,
    );
  });

  it('serves updated file content without a restart', async () => {
    await write('mocks/edited.json', '{"v":1}');
    const first = await pollFetch(
      `${baseUrl}/api/edited`,
      (r) => r.status === 200,
    );
    expect(await first.json()).toEqual({ v: 1 });

    await write('mocks/edited.json', '{"v":2}');

    const second = await pollFetch(
      `${baseUrl}/api/edited`,
      async (r) => {
        if (r.status !== 200) return false;
        const body = (await r.json()) as { v: number };
        return body.v === 2;
      },
    );
    expect(await second.json()).toEqual({ v: 2 });
  });

  it('keeps serving last-good routes if a re-scan throws on ambiguity', async () => {
    await write('mocks/stable.json', '{"ok":true}');
    await pollFetch(`${baseUrl}/api/stable`, (r) => r.status === 200);

    // Introduce an ambiguity: a folder named "stable" sibling to stable.json
    await write('mocks/stable/inside.json', '{}');
    await new Promise((r) => setTimeout(r, 200));

    // Previous /api/stable should still work — last-good routes are retained
    const res = await fetch(`${baseUrl}/api/stable`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });

    // Cleanup so the next test sees a clean state
    await rm(join(root, 'mocks/stable'), { recursive: true, force: true });
    await rm(join(root, 'mocks/stable.json'));
    await pollFetch(`${baseUrl}/api/stable`, (r) => r.status === 404);
  });
});
