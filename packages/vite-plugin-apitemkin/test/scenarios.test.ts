import { describe, it, expect, vi, beforeEach } from 'vitest';
import { defineMock } from '../src/index.js';
import type { ApitemkinRequest } from '../src/runtime.js';

function makeReq(overrides: Partial<ApitemkinRequest> = {}): ApitemkinRequest {
  return {
    method: 'GET',
    url: '/api/test',
    params: {},
    query: {},
    body: undefined,
    headers: {},
    ...overrides,
  };
}

describe('defineMock with scenarios object', () => {
  beforeEach(() => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  });

  it('attaches __apitemkin_scenarios with all keys', () => {
    const handler = defineMock<unknown>({
      default: { ok: true },
      error: { status: 500, body: {} },
      empty: [],
    });
    expect(handler.__apitemkin_scenarios).toEqual([
      'default',
      'error',
      'empty',
    ]);
  });

  it('returns the default scenario when no scenario is requested', async () => {
    const handler = defineMock<string>({ default: 'D', other: 'O' });
    expect(await handler(makeReq())).toBe('D');
    expect(console.warn).not.toHaveBeenCalled();
  });

  it('returns the named scenario when one is requested and exists', async () => {
    const handler = defineMock<string>({ default: 'D', other: 'O' });
    expect(await handler(makeReq({ scenario: 'other' }))).toBe('O');
    expect(console.warn).not.toHaveBeenCalled();
  });

  it('falls back to default and warns when the requested scenario is unknown', async () => {
    const handler = defineMock<string>({ default: 'D', error: 'E' });
    const result = await handler(
      makeReq({
        scenario: 'missing',
        method: 'GET',
        url: '/api/users',
      }),
    );
    expect(result).toBe('D');
    expect(console.warn).toHaveBeenCalledOnce();
    expect(console.warn).toHaveBeenCalledWith(
      expect.stringContaining(
        "scenario 'missing' not defined for GET /api/users",
      ),
    );
  });

  it('invokes a function variant with the request context', async () => {
    const handler = defineMock<{ id: string }>({
      default: ({ params }) => ({ id: params.id ?? '' }),
    });
    const result = await handler(makeReq({ params: { id: '42' } }));
    expect(result).toEqual({ id: '42' });
  });

  it('returns rich response variants verbatim', async () => {
    const rich = { status: 418, body: { reason: 'teapot' } };
    const handler = defineMock<unknown>({
      default: 'ok',
      teapot: rich,
    });
    expect(await handler(makeReq({ scenario: 'teapot' }))).toBe(rich);
  });

  it('returns array variants as the plain body', async () => {
    const handler = defineMock({
      default: [1, 2, 3],
      empty: [],
    });
    expect(await handler(makeReq({ scenario: 'empty' }))).toEqual([]);
  });

  it('handles async function variants', async () => {
    const handler = defineMock<string>({
      default: 'static',
      computed: async () => 'computed',
    });
    expect(await handler(makeReq({ scenario: 'computed' }))).toBe('computed');
  });

  it('falls back to default when scenario is the empty string', async () => {
    const handler = defineMock<string>({ default: 'D' });
    expect(await handler(makeReq({ scenario: '' }))).toBe('D');
    // Empty string is falsy; treated like "no scenario requested"
    expect(console.warn).not.toHaveBeenCalled();
  });
});
