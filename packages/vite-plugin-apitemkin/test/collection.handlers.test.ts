import { describe, it, expect, beforeEach } from 'vitest';
import {
  defineCollection,
  internalsOf,
  USAGE_ERROR,
  type Collection,
} from '../src/core/collection.js';
import { defineMock } from '../src/core/define-mock.js';
import type { ApitemkinHandler, ApitemkinRequest } from '../src/core/runtime.js';

type User = { id: number; name: string };

function req(opts: Partial<ApitemkinRequest> = {}): ApitemkinRequest {
  return {
    method: 'GET',
    url: '/api/users',
    params: {},
    query: {},
    body: undefined,
    headers: {},
    ...opts,
  };
}

const call = async (h: ApitemkinHandler, r: Partial<ApitemkinRequest> = {}) =>
  (await h(req(r))) as { status: number; body: unknown };

let c: Collection<User>;
beforeEach(() => {
  c = defineCollection<User>([
    { id: 1, name: 'Ada' },
    { id: 2, name: 'Bob' },
  ]);
});

describe('collection one-liners', () => {
  it('list() → 200 all records', async () => {
    expect(await call(c.list())).toEqual({ status: 200, body: c.all() });
  });

  it('get() → 200 record for a string url id', async () => {
    expect(await call(c.get(), { params: { id: '2' } })).toEqual({
      status: 200,
      body: { id: 2, name: 'Bob' },
    });
  });

  it('get() → 404 for an unknown id', async () => {
    expect((await call(c.get(), { params: { id: '9' } })).body).toEqual({
      error: 'No record with id 9',
    });
    internalsOf(c).name = 'users';
    expect(await call(c.get(), { params: { id: '9' } })).toEqual({
      status: 404,
      body: { error: 'No record with id 9 in users' },
    });
  });

  it('uses the last url param as the id', async () => {
    const res = await call(c.get(), { params: { orgId: '7', id: '1' } });
    expect(res.body).toEqual({ id: 1, name: 'Ada' });
  });

  it('get() without a url param throws a usage error', () => {
    let thrown: unknown;
    try {
      c.get()(req());
    } catch (err) {
      thrown = err;
    }
    expect((thrown as Record<symbol, unknown>)[USAGE_ERROR]).toBe(true);
    expect((thrown as Error).message).toContain('get() needs a URL param, e.g. [id].ts');
  });

  it('create() → 201 stored record with a new id', async () => {
    const res = await call(c.create(), { method: 'POST', body: { name: 'Cy' } });
    expect(res).toEqual({ status: 201, body: { id: 3, name: 'Cy' } });
    expect(c.all()).toHaveLength(3);
  });

  it('create() → 409 when the body id exists', async () => {
    const res = await call(c.create(), { method: 'POST', body: { id: 1, name: 'Dup' } });
    expect(res.status).toBe(409);
    expect(c.all()).toHaveLength(2);
  });

  it('create() → 409 (not 500) when a custom newId returns an id in use', async () => {
    const clash = defineCollection<User>([{ id: 1, name: 'Ada' }], { newId: () => 1 });
    const res = await call(clash.create(), { method: 'POST', body: { name: 'B' } });
    expect(res.status).toBe(409);
    expect((res.body as { error: string }).error).toContain('already exists');
    expect(clash.all()).toHaveLength(1);
  });

  it('replace() puts the id first', async () => {
    const res = await call(c.replace(), { params: { id: '1' }, body: { name: 'Z', id: 5 } });
    expect(Object.keys(res.body as object)).toEqual(['id', 'name']);
  });

  it.each([undefined, [], 'x', null])(
    'create()/replace()/update() → 400 for body %j',
    async (body) => {
      for (const h of [c.create(), c.replace(), c.update()]) {
        const res = await call(h, { method: 'POST', params: { id: '1' }, body });
        expect(res.status).toBe(400);
        expect((res.body as { error: string }).error).toContain('JSON object');
      }
      expect(c.all()).toEqual([
        { id: 1, name: 'Ada' },
        { id: 2, name: 'Bob' },
      ]);
    },
  );

  it('replace() → URL id wins and keeps its type', async () => {
    const res = await call(c.replace(), { params: { id: '1' }, body: { id: 5, name: 'Z' } });
    expect(res).toEqual({ status: 200, body: { id: 1, name: 'Z' } });
    expect(c.find(1)).toEqual({ id: 1, name: 'Z' });
  });

  it('replace() → 404 for an unknown id (no upsert)', async () => {
    const res = await call(c.replace(), { params: { id: '9' }, body: { name: 'Z' } });
    expect(res.status).toBe(404);
    expect(c.all()).toHaveLength(2);
  });

  it('update() → shallow merge, id unchanged', async () => {
    const res = await call(c.update(), { params: { id: '2' }, body: { id: 8, name: 'B2' } });
    expect(res).toEqual({ status: 200, body: { id: 2, name: 'B2' } });
    expect((await call(c.update(), { params: { id: '9' }, body: {} })).status).toBe(404);
  });

  it('remove() → 204, record gone', async () => {
    expect(await call(c.remove(), { params: { id: '1' } })).toEqual({ status: 204, body: '' });
    expect(c.find(1)).toBeUndefined();
    expect((await call(c.remove(), { params: { id: '1' } })).status).toBe(404);
  });

  it('wrap applies to success bodies only', async () => {
    const w = defineCollection<User>([{ id: 1, name: 'Ada' }], { wrap: (b) => ({ data: b }) });
    expect((await call(w.list())).body).toEqual({ data: [{ id: 1, name: 'Ada' }] });
    expect(await call(w.create(), { body: { name: 'N' } })).toEqual({
      status: 201,
      body: { data: { id: 2, name: 'N' } },
    });
    expect((await call(w.get(), { params: { id: '9' } })).body).toEqual({
      error: 'No record with id 9',
    });
    expect(await call(w.remove(), { params: { id: '1' } })).toEqual({ status: 204, body: '' });
  });

  it('one-liner works as a defineMock scenario', async () => {
    const h = defineMock({ default: c.create(), error: { status: 500, body: {} } });
    const failed = await call(h, { url: '/api/users?_scenario=error', body: { name: 'X' } });
    expect(failed.status).toBe(500);
    expect(c.all()).toHaveLength(2);
    expect((await call(h, { body: { name: 'X' } })).status).toBe(201);
    expect(c.all()).toHaveLength(3);
  });
});
