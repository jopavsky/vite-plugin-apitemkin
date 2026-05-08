import { describe, it, expect } from 'vitest';
import {
  compilePattern,
  findRoute,
  type RouteEntry,
} from '../src/devtools/match.js';

const route = (method: string, url: string, extra: Partial<RouteEntry> = {}): RouteEntry => ({
  method,
  url,
  kind: 'code',
  scenarios: [],
  ...extra,
});

describe('compilePattern', () => {
  it('matches an exact literal pattern', () => {
    const { regex } = compilePattern('/api/users');
    expect(regex.test('/api/users')).toBe(true);
    expect(regex.test('/api/users/42')).toBe(false);
    expect(regex.test('/api/user')).toBe(false);
  });

  it('matches a single param segment', () => {
    const { regex } = compilePattern('/api/users/:id');
    expect(regex.test('/api/users/42')).toBe(true);
    expect(regex.test('/api/users/abc-123')).toBe(true);
    expect(regex.test('/api/users')).toBe(false);
    expect(regex.test('/api/users/42/extra')).toBe(false);
  });

  it('matches multiple params interleaved with literals', () => {
    const { regex } = compilePattern('/api/:org/users/:id');
    expect(regex.test('/api/acme/users/42')).toBe(true);
    expect(regex.test('/api/acme/users')).toBe(false);
    expect(regex.test('/api/users/42')).toBe(false);
  });

  it('reports literalCount correctly', () => {
    expect(compilePattern('/api/users').literalCount).toBe(2);
    expect(compilePattern('/api/users/:id').literalCount).toBe(2);
    expect(compilePattern('/api/:org/users/:id').literalCount).toBe(2);
    expect(compilePattern('/api/v1/users/:id/posts').literalCount).toBe(4);
  });

  it('accepts an optional trailing slash on the request path', () => {
    const { regex } = compilePattern('/api/users');
    expect(regex.test('/api/users/')).toBe(true);
  });

  it('escapes special regex characters in literal segments', () => {
    const { regex } = compilePattern('/api/v1.0/users');
    expect(regex.test('/api/v1.0/users')).toBe(true);
    expect(regex.test('/api/v1x0/users')).toBe(false);
  });

  it('matches param segments containing percent-encoded characters', () => {
    const { regex } = compilePattern('/api/users/:id');
    expect(regex.test('/api/users/foo%20bar')).toBe(true);
    expect(regex.test('/api/users/a%2Fb')).toBe(true);
  });
});

describe('findRoute', () => {
  it('returns null when no routes are provided', () => {
    expect(findRoute([], 'GET', '/api/users')).toBeNull();
  });

  it('matches an exact literal route', () => {
    const r = route('GET', '/api/users');
    expect(findRoute([r], 'GET', '/api/users')).toBe(r);
  });

  it('matches a param route', () => {
    const r = route('GET', '/api/users/:id');
    expect(findRoute([r], 'GET', '/api/users/42')).toBe(r);
  });

  it('prefers a literal match over a param match (specificity)', () => {
    const literal = route('GET', '/api/users/me');
    const param = route('GET', '/api/users/:id');
    expect(findRoute([param, literal], 'GET', '/api/users/me')).toBe(literal);
    expect(findRoute([literal, param], 'GET', '/api/users/me')).toBe(literal);
    expect(findRoute([param, literal], 'GET', '/api/users/42')).toBe(param);
  });

  it('discriminates by method', () => {
    const get = route('GET', '/api/users');
    const post = route('POST', '/api/users');
    expect(findRoute([get, post], 'GET', '/api/users')).toBe(get);
    expect(findRoute([get, post], 'POST', '/api/users')).toBe(post);
  });

  it('treats method case-insensitively on input', () => {
    const r = route('GET', '/api/users');
    expect(findRoute([r], 'get', '/api/users')).toBe(r);
    expect(findRoute([r], 'Get', '/api/users')).toBe(r);
  });

  it('returns null on method mismatch', () => {
    const r = route('GET', '/api/users');
    expect(findRoute([r], 'POST', '/api/users')).toBeNull();
  });

  it('strips a trailing slash from the request path', () => {
    const r = route('GET', '/api/users');
    expect(findRoute([r], 'GET', '/api/users/')).toBe(r);
  });

  it('does not strip the root path', () => {
    const r = route('GET', '/');
    expect(findRoute([r], 'GET', '/')).toBe(r);
  });

  it('returns null when nothing matches', () => {
    const r = route('GET', '/api/users/:id');
    expect(findRoute([r], 'GET', '/other/path')).toBeNull();
    expect(findRoute([r], 'GET', '/api/users')).toBeNull();
    expect(findRoute([r], 'GET', '/api/users/42/extra')).toBeNull();
  });

  it('breaks ties on equal literal count by URL alpha (stable across input order)', () => {
    const a = route('GET', '/api/a/:x/foo');
    const b = route('GET', '/api/b/:x/foo');
    // Both have 3 literal segments. /api/a/... wins by alpha.
    expect(findRoute([a, b], 'GET', '/api/a/1/foo')).toBe(a);
    expect(findRoute([b, a], 'GET', '/api/a/1/foo')).toBe(a);
  });

  it('matches a request URL with percent-encoded segment values', () => {
    const r = route('GET', '/api/users/:id');
    expect(findRoute([r], 'GET', '/api/users/foo%20bar')).toBe(r);
  });
});
