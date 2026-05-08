import { describe, it, expect } from 'vitest';
import { maybeRewrite } from '../src/devtools/client.js';
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
    expect(out?.searchParams.get('apitemkin_scenario')).toBe('error');
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
    expect(out?.searchParams.get('apitemkin_scenario')).toBe('error');
  });

  it('overwrites a pre-existing apitemkin_scenario on the URL', () => {
    const state: SelectionMap = { 'GET /api/orders': 'error' };
    const out = maybeRewrite(
      u('/api/orders?apitemkin_scenario=empty'),
      'GET',
      ORIGIN,
      routes,
      state,
    );
    expect(out?.searchParams.get('apitemkin_scenario')).toBe('error');
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
    expect(out?.searchParams.get('apitemkin_scenario')).toBe('error');
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
        ?.searchParams.get('apitemkin_scenario'),
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
