// @vitest-environment happy-dom
// Bootstrap wiring for collections: loaded with discovery, refreshed after writes,
// and a collections-only project is not shown as "empty".
import { it, expect, vi, beforeAll } from 'vitest';

const USERS = { name: 'users', file: 'users/_data.ts', url: '/api/users', count: 2 };
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

const calls: string[] = [];
let shadow: ShadowRoot | undefined;

beforeAll(async () => {
  const realAttach = Element.prototype.attachShadow;
  vi.spyOn(Element.prototype, 'attachShadow').mockImplementation(function (this: Element, init) {
    shadow = realAttach.call(this, init);
    return shadow;
  });
  window.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    const path = new URL(url, window.location.href).pathname;
    calls.push(`${(init?.method ?? 'GET').toUpperCase()} ${path}`);
    if (path === '/_apitemkin/scenarios') return json([]); // no routes at all
    if (path === '/_apitemkin/collections') return json({ urlPrefix: '/api', collections: [USERS] });
    return json({}, 201);
  }) as unknown as typeof fetch;
  await import('../src/devtools/client.js');
  await vi.waitFor(() => expect(calls).toContain('GET /_apitemkin/collections'));
});

it('fetches collections alongside discovery', () => {
  expect(calls).toContain('GET /_apitemkin/scenarios');
  expect(calls).toContain('GET /_apitemkin/collections');
});

it('a project with collections but no routes is not "empty"', async () => {
  const launcher = shadow!.querySelector<HTMLButtonElement>('[data-part="launcher"]')!;
  launcher.click();
  await vi.waitFor(() =>
    expect(shadow!.querySelector('[data-part="collection-count"]')?.textContent).toBe('2 records'),
  );
  expect(shadow!.querySelector('[data-state="empty"]')).toBeNull();
});

it('a finished write under the prefix refreshes collections; a read does not', async () => {
  await new Promise((r) => setTimeout(r, 250)); // let the panel-open refresh settle
  const before = calls.filter((c) => c === 'GET /_apitemkin/collections').length;
  await window.fetch('/api/users');
  await new Promise((r) => setTimeout(r, 250));
  expect(calls.filter((c) => c === 'GET /_apitemkin/collections').length).toBe(before);
  await window.fetch('/api/users', { method: 'POST', body: '{}' });
  await vi.waitFor(() =>
    expect(calls.filter((c) => c === 'GET /_apitemkin/collections').length).toBe(before + 1),
  );
});
