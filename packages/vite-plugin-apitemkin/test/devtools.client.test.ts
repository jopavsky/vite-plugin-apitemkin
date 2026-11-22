import { describe, it, expect } from 'vitest';
import { maybeRewrite, trackRequest } from '../src/devtools/client.js';
import { createActivity } from '../src/devtools/activity.js';
import {
  pruneState,
  selectionKey,
  type SelectionMap,
} from '../src/devtools/state.js';
import type { RouteEntry } from '../src/devtools/match.js';

const ORIGIN = 'http://localhost:5173';

const route = (
  method: string,
  url: string,
  scenarios: string[] = [],
): RouteEntry => ({ method, url, kind: 'code', scenarios });

const u = (path: string): URL => new URL(path, ORIGIN);

describe('selectionKey', () => {
  it('uppercases the method', () => {
    expect(selectionKey('get', '/api/users')).toBe('GET /api/users');
    expect(selectionKey('Post', '/api/users')).toBe('POST /api/users');
  });
});

describe('maybeRewrite', () => {
  const routes = [route('GET', '/api/orders', ['default', 'error', 'empty'])];

  it('appends the scenario param when a selection is set', () => {
    const state: SelectionMap = { 'GET /api/orders': 'error' };
    const out = maybeRewrite(u('/api/orders'), 'GET', ORIGIN, routes, state);
    expect(out?.searchParams.get('_scenario')).toBe('error');
    expect(out?.pathname).toBe('/api/orders');
  });

  it('preserves existing query params on the URL', () => {
    const state: SelectionMap = { 'GET /api/orders': 'error' };
    const out = maybeRewrite(
      u('/api/orders?page=2&sort=desc'),
      'GET',
      ORIGIN,
      routes,
      state,
    );
    expect(out?.searchParams.get('page')).toBe('2');
    expect(out?.searchParams.get('sort')).toBe('desc');
    expect(out?.searchParams.get('_scenario')).toBe('error');
  });

  it('leaves a pre-existing _scenario on the URL alone (URL wins)', () => {
    const state: SelectionMap = { 'GET /api/orders': 'error' };
    const out = maybeRewrite(
      u('/api/orders?_scenario=empty'),
      'GET',
      ORIGIN,
      routes,
      state,
    );
    // Locality rule: explicit per-call URL param > panel-wide selection.
    expect(out).toBeNull();
  });

  it('leaves a pre-existing deprecated apitemkin_scenario alone', () => {
    const state: SelectionMap = { 'GET /api/orders': 'error' };
    const out = maybeRewrite(
      u('/api/orders?apitemkin_scenario=empty'),
      'GET',
      ORIGIN,
      routes,
      state,
    );
    expect(out).toBeNull();
  });

  it('leaves an empty _scenario param alone (still treated as explicit)', () => {
    const state: SelectionMap = { 'GET /api/orders': 'error' };
    const out = maybeRewrite(
      u('/api/orders?_scenario='),
      'GET',
      ORIGIN,
      routes,
      state,
    );
    expect(out).toBeNull();
  });

  it('returns null (pass-through) when no selection is set', () => {
    const out = maybeRewrite(u('/api/orders'), 'GET', ORIGIN, routes, {});
    expect(out).toBeNull();
  });

  it('returns null when the URL does not match a known route', () => {
    const state: SelectionMap = { 'GET /api/orders': 'error' };
    const out = maybeRewrite(u('/api/unknown'), 'GET', ORIGIN, routes, state);
    expect(out).toBeNull();
  });

  it('returns null for cross-origin URLs', () => {
    const state: SelectionMap = { 'GET /api/orders': 'error' };
    const out = maybeRewrite(
      new URL('http://other.example/api/orders'),
      'GET',
      ORIGIN,
      routes,
      state,
    );
    expect(out).toBeNull();
  });

  it('uses the matched routeʼs URL pattern as the selection key, not the literal request URL', () => {
    const r = [route('GET', '/api/users/:id', ['default', 'error'])];
    const state: SelectionMap = { 'GET /api/users/:id': 'error' };
    const out = maybeRewrite(u('/api/users/42'), 'GET', ORIGIN, r, state);
    expect(out?.searchParams.get('_scenario')).toBe('error');
  });

  it('respects method awareness when looking up the selection', () => {
    const r = [
      route('GET', '/api/users', ['default', 'empty']),
      route('POST', '/api/users', ['default', 'error']),
    ];
    const state: SelectionMap = { 'POST /api/users': 'error' };
    expect(
      maybeRewrite(u('/api/users'), 'GET', ORIGIN, r, state),
    ).toBeNull();
    expect(
      maybeRewrite(u('/api/users'), 'POST', ORIGIN, r, state)
        ?.searchParams.get('_scenario'),
    ).toBe('error');
  });
});

describe('pruneState', () => {
  const routes = [
    route('GET', '/api/orders', ['default', 'error', 'empty']),
    route('GET', '/api/profile', ['default', 'darkMode']),
  ];

  it('drops keys for routes no longer in discovery', () => {
    const state: SelectionMap = {
      'GET /api/orders': 'error',
      'GET /api/gone': 'default',
    };
    pruneState(state, routes);
    expect(state).toEqual({ 'GET /api/orders': 'error' });
  });

  it('drops keys whose chosen scenario name is no longer offered', () => {
    const state: SelectionMap = {
      'GET /api/orders': 'banana',
      'GET /api/profile': 'darkMode',
    };
    pruneState(state, routes);
    expect(state).toEqual({ 'GET /api/profile': 'darkMode' });
  });

  it('keeps keys whose route + scenario both still exist', () => {
    const state: SelectionMap = {
      'GET /api/orders': 'error',
      'GET /api/profile': 'darkMode',
    };
    pruneState(state, routes);
    expect(state).toEqual({
      'GET /api/orders': 'error',
      'GET /api/profile': 'darkMode',
    });
  });

  it('drops everything when discovery is empty', () => {
    const state: SelectionMap = { 'GET /api/orders': 'error' };
    pruneState(state, []);
    expect(state).toEqual({});
  });

  it('matches the methodʼs case in the key', () => {
    const state: SelectionMap = { 'get /api/orders': 'error' };
    pruneState(state, routes);
    expect(state).toEqual({});
  });
});

describe('trackRequest', () => {
  it('ignores cross-origin, unmatched and non-route URLs', () => {
    const a = createActivity(() => 0);
    const routes: RouteEntry[] = [{ method: 'GET', url: '/api/orders', scenarios: ['default', 'error'] }];
    expect(trackRequest(a, routes, 'GET', new URL('https://other.test/api/orders'), ORIGIN)).toBeNull();
    expect(trackRequest(a, routes, 'GET', new URL(`${ORIGIN}/api/nope`), ORIGIN)).toBeNull();
    expect(trackRequest(a, routes, 'GET', new URL(`${ORIGIN}/assets/x.js`), ORIGIN)).toBeNull();
    expect(a.get('GET /api/nope')).toBeUndefined();
  });

  it('logs a page-asked name the route does not define as unknown; the legacy param counts', () => {
    const a = createActivity(() => 0);
    const routes: RouteEntry[] = [{ method: 'GET', url: '/api/prices', scenarios: ['default', 'us-sub'] }];
    a.finish(trackRequest(a, routes, 'GET', new URL(`${ORIGIN}/api/prices?_scenario=eu-vatt`), ORIGIN)!, 200);
    a.finish(trackRequest(a, routes, 'GET', new URL(`${ORIGIN}/api/prices?apitemkin_scenario=us-sub`), ORIGIN)!, 200);
    expect(a.get('GET /api/prices')?.log).toEqual([
      expect.objectContaining({ name: 'us-sub', page: true, known: true }),
      expect.objectContaining({ name: 'eu-vatt', page: true, known: false, served: 'default' }),
    ]);
  });

  it('an empty ?_scenario= is logged as a plain request, not a page choice', () => {
    const a = createActivity(() => 0);
    const routes: RouteEntry[] = [{ method: 'GET', url: '/api/prices', scenarios: ['default'] }];
    a.finish(trackRequest(a, routes, 'GET', new URL(`${ORIGIN}/api/prices?_scenario=`), ORIGIN)!, 200);
    expect(a.get('GET /api/prices')?.log?.[0]).toMatchObject({ page: false, name: 'default' });
  });

  it('logs the scenario that answers: page param if defined, else default for unknown names, else the pick', () => {
    const a = createActivity(() => 0);
    const routes: RouteEntry[] = [{ method: 'GET', url: '/api/orders', scenarios: ['default', 'empty', 'error'] }];
    const go = (q: string, state = {}) => {
      a.finish(trackRequest(a, routes, 'GET', new URL(`${ORIGIN}/api/orders${q}`), ORIGIN, state)!, 200);
      return a.get('GET /api/orders')?.log?.[0]?.served;
    };
    expect(go('', { 'GET /api/orders': 'error' })).toBe('error');
    expect(go('?_scenario=empty', { 'GET /api/orders': 'error' })).toBe('empty');
    expect(go('?_scenario=nope', { 'GET /api/orders': 'error' })).toBe('default');
    expect(go('')).toBe('default');
  });

  it('records whether the panel will send a scenario with the request', () => {
    const a = createActivity(() => 0);
    const routes: RouteEntry[] = [{ method: 'GET', url: '/api/orders', scenarios: ['default', 'error'] }];
    const t = trackRequest(a, routes, 'GET', new URL(`${ORIGIN}/api/orders`), ORIGIN, { 'GET /api/orders': 'error' })!;
    a.finish(t, 500);
    expect(a.get('GET /api/orders')?.scenario).toBe(true);
  });

  it('starts activity for a matched route and records an explicit URL scenario', () => {
    const a = createActivity(() => 0);
    const routes: RouteEntry[] = [{ method: 'GET', url: '/api/orders', scenarios: ['default', 'error'] }];
    expect(trackRequest(a, routes, 'GET', new URL(`${ORIGIN}/api/orders?_scenario=empty`), ORIGIN)).not.toBeNull();
    expect(a.get('GET /api/orders')?.urlScenario).toBe('empty');
    expect(trackRequest(a, routes, 'get', new URL(`${ORIGIN}/api/orders`), ORIGIN)).not.toBeNull();
    expect(a.get('GET /api/orders')?.urlScenario).toBeUndefined();
  });
});
