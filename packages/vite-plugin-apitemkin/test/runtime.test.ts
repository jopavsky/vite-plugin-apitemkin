import { describe, it, expect } from 'vitest';
import { Readable } from 'node:stream';
import type { IncomingMessage } from 'node:http';
import { isRichResponse, parseQuery, readJsonBody } from '../src/runtime.js';

function mockReq(opts: {
  headers?: Record<string, string>;
  body?: string;
}): IncomingMessage {
  const stream = Readable.from(opts.body !== undefined ? [opts.body] : []);
  (stream as unknown as { headers: Record<string, string> }).headers =
    opts.headers ?? {};
  return stream as unknown as IncomingMessage;
}

describe('readJsonBody', () => {
  it('parses JSON when content-type is application/json', async () => {
    const req = mockReq({
      headers: { 'content-type': 'application/json' },
      body: '{"a":1}',
    });
    expect(await readJsonBody(req)).toEqual({ a: 1 });
  });

  it('returns undefined when content-type is not JSON', async () => {
    const req = mockReq({
      headers: { 'content-type': 'text/plain' },
      body: 'hello',
    });
    expect(await readJsonBody(req)).toBeUndefined();
  });

  it('returns undefined for empty body even with JSON content-type', async () => {
    const req = mockReq({
      headers: { 'content-type': 'application/json' },
      body: '',
    });
    expect(await readJsonBody(req)).toBeUndefined();
  });

  it('handles content-type with a charset suffix', async () => {
    const req = mockReq({
      headers: { 'content-type': 'application/json; charset=utf-8' },
      body: '{"x":true}',
    });
    expect(await readJsonBody(req)).toEqual({ x: true });
  });

  it('throws on malformed JSON', async () => {
    const req = mockReq({
      headers: { 'content-type': 'application/json' },
      body: 'not json',
    });
    await expect(readJsonBody(req)).rejects.toThrow();
  });

  it('returns undefined when content-type header is missing', async () => {
    const req = mockReq({ body: '{"a":1}' });
    expect(await readJsonBody(req)).toBeUndefined();
  });
});

describe('parseQuery', () => {
  it('returns empty object for URL with no query', () => {
    expect(parseQuery('/api/users')).toEqual({});
  });

  it('parses a single key-value', () => {
    expect(parseQuery('/api/users?page=2')).toEqual({ page: '2' });
  });

  it('parses multiple keys', () => {
    expect(parseQuery('/api/users?page=2&limit=10')).toEqual({
      page: '2',
      limit: '10',
    });
  });

  it('returns an array for repeated keys', () => {
    expect(parseQuery('/api/users?tag=a&tag=b')).toEqual({
      tag: ['a', 'b'],
    });
  });

  it('strips hash before parsing', () => {
    expect(parseQuery('/api/users?page=1#top')).toEqual({ page: '1' });
  });

  it('decodes URL-encoded values', () => {
    expect(parseQuery('/api/users?q=hello%20world')).toEqual({
      q: 'hello world',
    });
  });
});

describe('isRichResponse', () => {
  it('rejects null', () => expect(isRichResponse(null)).toBe(false));
  it('rejects undefined', () => expect(isRichResponse(undefined)).toBe(false));
  it('rejects strings', () => expect(isRichResponse('hello')).toBe(false));
  it('rejects numbers', () => expect(isRichResponse(42)).toBe(false));
  it('rejects arrays', () => expect(isRichResponse([1, 2, 3])).toBe(false));

  it('rejects plain objects without status/headers', () => {
    expect(isRichResponse({ id: 1, name: 'Ada' })).toBe(false);
  });

  it('rejects { body } alone (ambiguous with literal "body" key in payload)', () => {
    expect(isRichResponse({ body: 'hi' })).toBe(false);
  });

  it('accepts object with body and status', () => {
    expect(isRichResponse({ status: 201, body: {} })).toBe(true);
  });

  it('accepts object with body and headers', () => {
    expect(isRichResponse({ headers: {}, body: {} })).toBe(true);
  });

  it('accepts object with body, status, and headers', () => {
    expect(isRichResponse({ status: 200, headers: {}, body: {} })).toBe(true);
  });

  it('accepts object with body and delay', () => {
    expect(isRichResponse({ delay: 100, body: {} })).toBe(true);
  });
});
