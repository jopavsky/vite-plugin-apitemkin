import { describe, it, expect } from 'vitest';
import { matchRoute } from '../src/matcher.js';
import type { HttpMethod, MockRoute, PathSegment } from '../src/scanner.js';

const literal = (value: string): PathSegment => ({ kind: 'literal', value });
const param = (name: string): PathSegment => ({ kind: 'param', name });

function makeRoute(
  method: HttpMethod,
  urlPattern: string,
  segments: PathSegment[],
  filePath = `/fake/${urlPattern.replace(/[/:]/g, '_')}.json`,
): MockRoute {
  return { method, urlPattern, segments, filePath };
}

describe('matchRoute', () => {
  it('returns null when no routes are provided', () => {
    expect(matchRoute([], 'GET', '/api/users')).toBeNull();
  });

  it('matches an exact literal route', () => {
    const r = makeRoute('GET', '/api/users', [literal('users')]);
    const result = matchRoute([r], 'GET', '/api/users');
    expect(result?.route).toBe(r);
    expect(result?.params).toEqual({});
  });

  it('captures a single param', () => {
    const r = makeRoute('GET', '/api/users/:id', [literal('users'), param('id')]);
    const result = matchRoute([r], 'GET', '/api/users/42');
    expect(result?.params).toEqual({ id: '42' });
  });

  it('captures multiple params', () => {
    const r = makeRoute(
      'GET',
      '/api/:org/users/:id',
      [param('org'), literal('users'), param('id')],
    );
    const result = matchRoute([r], 'GET', '/api/acme/users/42');
    expect(result?.params).toEqual({ org: 'acme', id: '42' });
  });

  it('discriminates by method', () => {
    const get = makeRoute('GET', '/api/users', [literal('users')]);
    const post = makeRoute('POST', '/api/users', [literal('users')]);
    expect(matchRoute([get, post], 'GET', '/api/users')?.route).toBe(get);
    expect(matchRoute([get, post], 'POST', '/api/users')?.route).toBe(post);
  });

  it('treats method case-insensitively on input', () => {
    const r = makeRoute('GET', '/api/users', [literal('users')]);
    expect(matchRoute([r], 'get', '/api/users')?.route).toBe(r);
    expect(matchRoute([r], 'Get', '/api/users')?.route).toBe(r);
  });

  it('returns null on method mismatch', () => {
    const r = makeRoute('GET', '/api/users', [literal('users')]);
    expect(matchRoute([r], 'POST', '/api/users')).toBeNull();
  });

  it('prefers a literal route over a param route at the same position', () => {
    const me = makeRoute('GET', '/api/users/me', [literal('users'), literal('me')]);
    const id = makeRoute('GET', '/api/users/:id', [literal('users'), param('id')]);
    const result = matchRoute([id, me], 'GET', '/api/users/me');
    expect(result?.route).toBe(me);
  });

  it('falls back to a param route when no literal matches', () => {
    const me = makeRoute('GET', '/api/users/me', [literal('users'), literal('me')]);
    const id = makeRoute('GET', '/api/users/:id', [literal('users'), param('id')]);
    const result = matchRoute([id, me], 'GET', '/api/users/42');
    expect(result?.route).toBe(id);
    expect(result?.params).toEqual({ id: '42' });
  });

  it('strips query string before matching', () => {
    const r = makeRoute('GET', '/api/users', [literal('users')]);
    expect(matchRoute([r], 'GET', '/api/users?page=2&limit=10')?.route).toBe(r);
  });

  it('strips hash before matching', () => {
    const r = makeRoute('GET', '/api/users', [literal('users')]);
    expect(matchRoute([r], 'GET', '/api/users#top')?.route).toBe(r);
  });

  it('treats trailing slash as no slash', () => {
    const r = makeRoute('GET', '/api/users', [literal('users')]);
    expect(matchRoute([r], 'GET', '/api/users/')?.route).toBe(r);
  });

  it('returns null on segment count mismatch', () => {
    const r = makeRoute('GET', '/api/users/:id', [literal('users'), param('id')]);
    expect(matchRoute([r], 'GET', '/api/users')).toBeNull();
    expect(matchRoute([r], 'GET', '/api/users/42/extra')).toBeNull();
  });

  it('returns null when URL does not start with the prefix', () => {
    const r = makeRoute('GET', '/api/users', [literal('users')]);
    expect(matchRoute([r], 'GET', '/users')).toBeNull();
    expect(matchRoute([r], 'GET', '/v1/users')).toBeNull();
  });

  it('matches the API root when the route has no segments', () => {
    const r = makeRoute('GET', '/api', []);
    expect(matchRoute([r], 'GET', '/api')?.route).toBe(r);
    expect(matchRoute([r], 'GET', '/api/')?.route).toBe(r);
  });

  it('respects a custom URL prefix', () => {
    const r = makeRoute('GET', '/v1/users', [literal('users')]);
    expect(matchRoute([r], 'GET', '/v1/users', '/v1')?.route).toBe(r);
    expect(matchRoute([r], 'GET', '/api/users', '/v1')).toBeNull();
  });

  it('decodes URL-encoded param values', () => {
    const r = makeRoute('GET', '/api/users/:id', [literal('users'), param('id')]);
    expect(matchRoute([r], 'GET', '/api/users/hello%20world')?.params).toEqual({
      id: 'hello world',
    });
  });

  it('matches when prefix is empty', () => {
    const r = makeRoute('GET', '/users', [literal('users')]);
    expect(matchRoute([r], 'GET', '/users', '')?.route).toBe(r);
  });

  it('tie-breaks by filePath when literal-count is equal', () => {
    const a = makeRoute('GET', '/api/:x', [param('x')], '/zzz.json');
    const b = makeRoute('GET', '/api/:y', [param('y')], '/aaa.json');
    const result = matchRoute([a, b], 'GET', '/api/anything');
    expect(result?.route.filePath).toBe('/aaa.json');
  });

  it('does not bleed prefix into route matching when prefix appears in route name', () => {
    // Defensive: route literal "api" inside the URL after the prefix should still match
    const r = makeRoute('GET', '/api/api', [literal('api')]);
    expect(matchRoute([r], 'GET', '/api/api')?.route).toBe(r);
  });
});
