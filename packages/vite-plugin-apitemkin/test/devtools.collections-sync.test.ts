import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  createCollectionsSync,
  isWriteUnderPrefix,
  parseCollections,
} from '../src/devtools/collections.js';

const USERS = { name: 'users', file: 'users/_data.ts', url: '/api/users', count: 2 };
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('parseCollections', () => {
  it('accepts the endpoint shape and drops malformed entries', () => {
    expect(
      parseCollections({ urlPrefix: '/api', collections: [USERS, { name: 'x' }, null, 'nope'] }),
    ).toEqual({ urlPrefix: '/api', collections: [USERS] });
  });

  it('rejects the wrong shape', () => {
    expect(parseCollections([USERS])).toBeNull();
    expect(parseCollections({ collections: [] })).toBeNull();
    expect(parseCollections(null)).toBeNull();
  });
});

describe('isWriteUnderPrefix', () => {
  const origin = 'http://localhost:5173';
  const u = (path: string, o = origin) => new URL(path, o);

  it('counts non-GET same-origin requests under the prefix', () => {
    expect(isWriteUnderPrefix('POST', u('/api/users'), origin, '/api')).toBe(true);
    expect(isWriteUnderPrefix('delete', u('/api/users/1'), origin, '/api')).toBe(true);
  });

  it('ignores reads, other origins, other paths and the plugin endpoints', () => {
    expect(isWriteUnderPrefix('GET', u('/api/users'), origin, '/api')).toBe(false);
    expect(isWriteUnderPrefix('HEAD', u('/api/users'), origin, '/api')).toBe(false);
    expect(isWriteUnderPrefix('POST', u('/api/users', 'http://other'), origin, '/api')).toBe(false);
    expect(isWriteUnderPrefix('POST', u('/apix'), origin, '/api')).toBe(false);
    expect(isWriteUnderPrefix('POST', u('/_apitemkin/collections/reset'), origin, '')).toBe(false);
  });

  it('counts any same-origin write when the prefix is unknown or empty', () => {
    expect(isWriteUnderPrefix('POST', u('/anything'), origin, undefined)).toBe(true);
    expect(isWriteUnderPrefix('POST', u('/anything'), origin, '')).toBe(true);
  });
});

describe('createCollectionsSync', () => {
  it('load() fetches /_apitemkin/collections and exposes list and prefix', async () => {
    const fetchFn = vi.fn(async () => json({ urlPrefix: '/api', collections: [USERS] }));
    const sync = createCollectionsSync(fetchFn as unknown as typeof fetch, () => {});
    expect(sync.prefix()).toBeUndefined();
    await sync.load();
    expect(fetchFn).toHaveBeenCalledWith('/_apitemkin/collections');
    expect(sync.get()).toEqual([USERS]);
    expect(sync.prefix()).toBe('/api');
  });

  it('load() rejects on a failing endpoint and keeps the last list', async () => {
    const fetchFn = vi
      .fn()
      .mockResolvedValueOnce(json({ urlPrefix: '/api', collections: [USERS] }))
      .mockResolvedValueOnce(json({ error: 'x' }, 500));
    const sync = createCollectionsSync(fetchFn as unknown as typeof fetch, () => {});
    await sync.load();
    await expect(sync.load()).rejects.toThrow('HTTP 500');
    expect(sync.get()).toEqual([USERS]);
  });

  it('reset() POSTs {file,name} and updates the count', async () => {
    const fetchFn = vi
      .fn()
      .mockResolvedValueOnce(json({ urlPrefix: '/api', collections: [{ ...USERS, count: 9 }] }))
      .mockResolvedValueOnce(json(USERS));
    const sync = createCollectionsSync(fetchFn as unknown as typeof fetch, () => {});
    await sync.load();
    await sync.reset('users/_data.ts', 'users');
    expect(fetchFn).toHaveBeenLastCalledWith('/_apitemkin/collections/reset', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ file: 'users/_data.ts', name: 'users' }),
    });
    expect(sync.get()[0]!.count).toBe(2);
  });

  it('reset() rejects when the server refuses', async () => {
    const fetchFn = vi.fn(async () => json({ error: 'no' }, 404));
    const sync = createCollectionsSync(fetchFn as unknown as typeof fetch, () => {});
    await expect(sync.reset('a', 'b')).rejects.toThrow('HTTP 404');
  });

  it('scheduleRefresh() debounces into one load, then calls onUpdate', async () => {
    vi.useFakeTimers();
    const fetchFn = vi.fn(async () => json({ urlPrefix: '/api', collections: [USERS] }));
    const onUpdate = vi.fn();
    const sync = createCollectionsSync(fetchFn as unknown as typeof fetch, onUpdate, 150);
    sync.scheduleRefresh();
    sync.scheduleRefresh();
    sync.scheduleRefresh();
    expect(fetchFn).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(150);
    expect(fetchFn).toHaveBeenCalledTimes(1);
    expect(onUpdate).toHaveBeenCalledTimes(1);
  });

  it('a refresh that changes nothing does not call onUpdate (no needless list rebuild)', async () => {
    vi.useFakeTimers();
    const fetchFn = vi.fn(async () => json({ urlPrefix: '/api', collections: [USERS] }));
    const onUpdate = vi.fn();
    const sync = createCollectionsSync(fetchFn as unknown as typeof fetch, onUpdate, 10);
    await sync.load();
    sync.scheduleRefresh();
    await vi.advanceTimersByTimeAsync(10);
    expect(fetchFn).toHaveBeenCalledTimes(2);
    expect(onUpdate).not.toHaveBeenCalled();
  });

  it('a failed refresh warns instead of throwing', async () => {
    vi.useFakeTimers();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const fetchFn = vi.fn(async () => json({}, 500));
    const onUpdate = vi.fn();
    const sync = createCollectionsSync(fetchFn as unknown as typeof fetch, onUpdate, 10);
    sync.scheduleRefresh();
    await vi.advanceTimersByTimeAsync(10);
    expect(onUpdate).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalled();
  });
});
