import { describe, it, expect } from 'vitest';
import {
  filterRoutes,
  groupRoutes,
  inferPrefix,
  lastLiteralSegment,
  launcherContent,
  overriddenKeys,
  splitPrefix,
} from '../src/devtools/model.js';
import type { RouteEntry } from '../src/devtools/match.js';

const R = (method: string, url: string, scenarios: string[] = []): RouteEntry => ({
  method,
  url,
  scenarios,
});

describe('groupRoutes', () => {
  it('groups by first segment after the prefix; single-route folders fold into /api', () => {
    const groups = groupRoutes(
      [
        R('GET', '/api/healthcheck'),
        R('GET', '/api/orders'),
        R('GET', '/api/users'),
        R('POST', '/api/users'),
        R('GET', '/api/users/:id'),
      ],
      '/api',
    );
    expect(groups.map((g) => [g.label, g.routes.length])).toEqual([
      ['/api', 2],
      ['/api/users', 3],
    ]);
  });

  it('sorts routes inside a group by url, then method', () => {
    const [group] = groupRoutes([R('POST', '/api/x/b'), R('GET', '/api/x/b'), R('GET', '/api/x/a')], '/api');
    expect(group!.label).toBe('/api/x');
    expect(group!.routes.map((r) => `${r.method} ${r.url}`)).toEqual([
      'GET /api/x/a',
      'GET /api/x/b',
      'POST /api/x/b',
    ]);
  });
});

describe('overrides', () => {
  it('counts only overrides whose route and scenario still exist (pruned route drops out)', () => {
    const routes = [R('GET', '/api/orders', ['default', 'error'])];
    expect(overriddenKeys({ 'GET /api/orders': 'error', 'GET /api/gone': 'x' }, routes)).toEqual([
      'GET /api/orders',
    ]);
    expect(launcherContent({ 'GET /api/gone': 'x' }, routes).chip).toBeNull();
  });

  it('launcher chip: 1 override names it, 2+ counts', () => {
    const routes = [
      R('GET', '/api/orders', ['default', 'error']),
      R('GET', '/api/profile', ['default', 'darkMode']),
    ];
    expect(launcherContent({}, routes)).toEqual({
      chip: null,
      accessibleName: 'apitemkin. Open panel',
    });
    expect(launcherContent({ 'GET /api/orders': 'error' }, routes)).toEqual({
      chip: 'orders: error',
      accessibleName: 'apitemkin orders: error. GET /api/orders is overridden. Open panel',
    });
    expect(
      launcherContent({ 'GET /api/orders': 'error', 'GET /api/profile': 'darkMode' }, routes),
    ).toEqual({ chip: '2 overridden', accessibleName: 'apitemkin 2 overridden. Open panel' });
  });
});

describe('helpers', () => {
  it('lastLiteralSegment skips params', () => {
    expect(lastLiteralSegment('/api/users/:id')).toBe('users');
  });

  it('filterRoutes matches method+path case-insensitively and honours onlyKeys', () => {
    const routes = [R('GET', '/api/orders'), R('POST', '/api/echo')];
    expect(filterRoutes(routes, 'post', null).map((r) => r.url)).toEqual(['/api/echo']);
    expect(filterRoutes(routes, '', new Set(['GET /api/orders'])).map((r) => r.url)).toEqual([
      '/api/orders',
    ]);
  });

  it('splitPrefix separates the url prefix for dimming', () => {
    expect(splitPrefix('/api/orders', '/api')).toEqual({ prefix: '/api/', rest: 'orders' });
    expect(splitPrefix('/other', '/api')).toEqual({ prefix: '', rest: '/other' });
  });
});

describe('inferPrefix', () => {
  it('uses the shared first segment when every route has more after it', () => {
    expect(inferPrefix([R('GET', '/api/a'), R('GET', '/api/b/c')])).toBe('/api');
  });
  it('returns "" when routes disagree, are empty, or sit at the root', () => {
    expect(inferPrefix([R('GET', '/api/a'), R('GET', '/v2/b')])).toBe('');
    expect(inferPrefix([])).toBe('');
    expect(inferPrefix([R('GET', '/users'), R('GET', '/users/:id')])).toBe('');
  });
});

describe('groupRoutes with collections', () => {
  const C = (url: string, name = 'users') => ({ name, file: `${name}/_data.ts`, url, count: 2 });

  it('collections join the group of their folder url', () => {
    const groups = groupRoutes([R('GET', '/api/users'), R('POST', '/api/users')], '/api', [C('/api/users')]);
    expect(groups).toHaveLength(1);
    expect(groups[0]!.label).toBe('/api/users');
    expect(groups[0]!.collections).toEqual([C('/api/users')]);
  });

  it('a group with a collection never folds into root', () => {
    const groups = groupRoutes([R('GET', '/api/todos')], '/api', [C('/api/todos', 'todos')]);
    expect(groups.map((g) => [g.label, g.routes.length, g.collections.length])).toEqual([['/api/todos', 1, 1]]);
  });

  it('a collection with no routes still makes a group', () => {
    const groups = groupRoutes([], '/api', [C('/api/users')]);
    expect(groups.map((g) => [g.label, g.routes.length, g.collections.length])).toEqual([['/api/users', 0, 1]]);
  });

  it('a nested collection joins its first-segment group', () => {
    const groups = groupRoutes([R('GET', '/api/orgs/:orgId/teams'), R('GET', '/api/orgs')], '/api', [
      C('/api/orgs/:orgId', 'teams'),
    ]);
    expect(groups.map((g) => [g.label, g.collections.length])).toEqual([['/api/orgs', 1]]);
  });

  it('a collection at the prefix goes to the root group', () => {
    const groups = groupRoutes([R('GET', '/api/health')], '/api', [C('/api', 'root')]);
    expect(groups.map((g) => [g.label, g.routes.length, g.collections.length])).toEqual([['/api', 1, 1]]);
  });

  it('existing calls without collections get empty collection lists', () => {
    const groups = groupRoutes([R('GET', '/api/a'), R('GET', '/api/users'), R('POST', '/api/users')], '/api');
    expect(groups.every((g) => Array.isArray(g.collections) && g.collections.length === 0)).toBe(true);
  });
});
