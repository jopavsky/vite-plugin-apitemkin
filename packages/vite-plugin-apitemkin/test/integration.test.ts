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

  // v0.2 — code-file mocks
  await write(
    'mocks/whoami.ts',
    `export default ({ method, headers }: any) => ({ method, ua: headers['user-agent'] ?? null });`,
  );
  await write(
    'mocks/echo.post.ts',
    `export default async ({ body }: any) => ({ received: body });`,
  );
  await write(
    'mocks/dyn/[id].ts',
    `export default ({ params, query }: any) => ({ id: Number(params.id), expand: query.expand === 'true' });`,
  );
  await write(
    'mocks/teapot.ts',
    `export default () => ({ status: 418, body: { reason: "I'm a teapot" } });`,
  );
  await write(
    'mocks/hdr.ts',
    `export default () => ({ headers: { 'x-custom': 'apitemkin' }, body: { ok: true } });`,
  );
  await write('mocks/text.ts', `export default () => 'hello world';`);
  await write(
    'mocks/boom.ts',
    `export default () => { throw new Error('boom'); };`,
  );
  await write(
    'mocks/notdefault.ts',
    `export const handler = () => ({});`,
  );

  // v0.3 — scenarios. Inline dispatch mimics defineScenarios; the helper
  // itself is unit-tested in scenarios.test.ts. Inlining keeps the fixture
  // independent of node_modules resolution from Vite's tmp-dir root.
  await write(
    'mocks/scenario-test/index.ts',
    `const scenarios: Record<string, unknown> = {
  default: [{ id: 1, name: 'default-name' }],
  empty: [],
  error: { status: 500, body: { error: 'boom' } },
};
const handler = ({ scenario }: any) => {
  const chosen = scenario && Object.prototype.hasOwnProperty.call(scenarios, scenario)
    ? scenarios[scenario]
    : scenarios.default;
  return chosen;
};
(handler as any).__apitemkin_scenarios = Object.keys(scenarios);
export default handler;`,
  );
  await write(
    'mocks/scenario-echo.ts',
    `export default ({ scenario, query }: any) => ({ scenario, query });`,
  );

  await write(
    'index.html',
    '<!doctype html><html><body><div id="app"></div></body></html>',
  );

  server = await createServer({
    root,
    server: { port: 0 },
    plugins: [apitemkin({ delay: 0 })],
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

  describe('code-file mocks (v0.2)', () => {
    it('invokes a TS handler and returns the value as JSON', async () => {
      const res = await fetch(`${baseUrl}/api/whoami`, {
        headers: { 'user-agent': 'test-agent' },
      });
      expect(res.status).toBe(200);
      expect(res.headers.get('content-type')).toContain('application/json');
      const body = (await res.json()) as { method: string; ua: string };
      expect(body.method).toBe('GET');
      expect(body.ua).toBe('test-agent');
    });

    it('parses a JSON request body and passes it to the handler', async () => {
      const res = await fetch(`${baseUrl}/api/echo`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ hi: 1 }),
      });
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ received: { hi: 1 } });
    });

    it('captures dynamic params and query for code handlers', async () => {
      const res = await fetch(`${baseUrl}/api/dyn/42?expand=true`);
      expect(await res.json()).toEqual({ id: 42, expand: true });
    });

    it('respects a rich response status code', async () => {
      const res = await fetch(`${baseUrl}/api/teapot`);
      expect(res.status).toBe(418);
      expect(await res.json()).toEqual({ reason: "I'm a teapot" });
    });

    it('respects rich response custom headers', async () => {
      const res = await fetch(`${baseUrl}/api/hdr`);
      expect(res.headers.get('x-custom')).toBe('apitemkin');
      expect(await res.json()).toEqual({ ok: true });
    });

    it('returns string handler responses as text/plain', async () => {
      const res = await fetch(`${baseUrl}/api/text`);
      expect(res.status).toBe(200);
      expect(res.headers.get('content-type')).toContain('text/plain');
      expect(await res.text()).toBe('hello world');
    });

    it('handler that throws returns a 500 JSON envelope', async () => {
      const res = await fetch(`${baseUrl}/api/boom`);
      expect(res.status).toBe(500);
      expect(res.headers.get('content-type')).toContain('application/json');
      const body = (await res.json()) as { error: string };
      expect(body.error).toContain('boom');
    });

    it('module without a default export returns 500 with a guided message', async () => {
      const res = await fetch(`${baseUrl}/api/notdefault`);
      expect(res.status).toBe(500);
      const body = (await res.json()) as { error: string };
      expect(body.error).toMatch(/must default-export a handler function/);
    });
  });

  describe('scenarios (v0.3)', () => {
    it('defaults to the "default" scenario when none is requested', async () => {
      const res = await fetch(`${baseUrl}/api/scenario-test`);
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual([{ id: 1, name: 'default-name' }]);
    });

    it('returns the named scenario when query param matches', async () => {
      const res = await fetch(
        `${baseUrl}/api/scenario-test?apitemkin_scenario=empty`,
      );
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual([]);
    });

    it('honours rich responses for named scenarios (500 + body)', async () => {
      const res = await fetch(
        `${baseUrl}/api/scenario-test?apitemkin_scenario=error`,
      );
      expect(res.status).toBe(500);
      expect(await res.json()).toEqual({ error: 'boom' });
    });

    it('falls back to default when the scenario is unknown', async () => {
      const res = await fetch(
        `${baseUrl}/api/scenario-test?apitemkin_scenario=bogus`,
      );
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual([{ id: 1, name: 'default-name' }]);
    });

    it('exposes req.scenario to plain defineMock handlers and strips it from req.query', async () => {
      const res = await fetch(
        `${baseUrl}/api/scenario-echo?apitemkin_scenario=foo&page=1`,
      );
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ scenario: 'foo', query: { page: '1' } });
    });

    it('omits req.scenario when no apitemkin_scenario param is passed', async () => {
      const res = await fetch(`${baseUrl}/api/scenario-echo?page=1`);
      expect(res.status).toBe(200);
      const body = (await res.json()) as {
        scenario?: string;
        query: Record<string, string>;
      };
      expect(body.scenario).toBeUndefined();
      expect(body.query).toEqual({ page: '1' });
    });
  });

  describe('discovery endpoint /_apitemkin/scenarios (v0.3)', () => {
    type Entry = {
      method: string;
      url: string;
      kind: 'json' | 'code';
      scenarios: string[];
    };

    it('returns 200 JSON', async () => {
      const res = await fetch(`${baseUrl}/_apitemkin/scenarios`);
      expect(res.status).toBe(200);
      expect(res.headers.get('content-type')).toContain('application/json');
    });

    it('every entry has the documented shape', async () => {
      const res = await fetch(`${baseUrl}/_apitemkin/scenarios`);
      const entries = (await res.json()) as Entry[];
      expect(entries.length).toBeGreaterThan(0);
      for (const entry of entries) {
        expect(typeof entry.method).toBe('string');
        expect(typeof entry.url).toBe('string');
        expect(['json', 'code']).toContain(entry.kind);
        expect(Array.isArray(entry.scenarios)).toBe(true);
      }
    });

    it('marks JSON routes as kind: json with empty scenarios', async () => {
      const res = await fetch(`${baseUrl}/_apitemkin/scenarios`);
      const entries = (await res.json()) as Entry[];
      const healthcheck = entries.find((e) => e.url === '/api/healthcheck');
      expect(healthcheck).toMatchObject({
        method: 'GET',
        kind: 'json',
        scenarios: [],
      });
    });

    it('marks plain code routes without scenarios as kind: code, scenarios: []', async () => {
      const res = await fetch(`${baseUrl}/_apitemkin/scenarios`);
      const entries = (await res.json()) as Entry[];
      const whoami = entries.find((e) => e.url === '/api/whoami');
      expect(whoami).toMatchObject({
        method: 'GET',
        kind: 'code',
        scenarios: [],
      });
    });

    it('lists scenario names for handlers that attach __apitemkin_scenarios', async () => {
      const res = await fetch(`${baseUrl}/_apitemkin/scenarios`);
      const entries = (await res.json()) as Entry[];
      const scenarioTest = entries.find(
        (e) => e.url === '/api/scenario-test',
      );
      expect(scenarioTest).toMatchObject({
        method: 'GET',
        kind: 'code',
        scenarios: ['default', 'empty', 'error'],
      });
    });

    it('handles query strings on the discovery path', async () => {
      const res = await fetch(
        `${baseUrl}/_apitemkin/scenarios?ignored=param`,
      );
      expect(res.status).toBe(200);
      const entries = (await res.json()) as Entry[];
      expect(entries.length).toBeGreaterThan(0);
    });
  });
});
