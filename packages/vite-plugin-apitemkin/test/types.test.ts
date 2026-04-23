import { describe, it, expect, expectTypeOf } from 'vitest';
import {
  defineMock,
  type ApitemkinHandler,
  type ApitemkinRequest,
  type RichResponse,
} from '../src/index.js';

interface User {
  id: number;
  name: string;
}

describe('defineMock', () => {
  it('is identity at runtime', () => {
    const fn = (req: ApitemkinRequest) => ({ ok: true, url: req.url });
    expect(defineMock(fn)).toBe(fn);
  });

  it('infers TBody from the explicit generic', () => {
    const h = defineMock<User>(() => ({ id: 1, name: 'Ada' }));
    expectTypeOf(h).toEqualTypeOf<ApitemkinHandler<User>>();
  });

  it('allows returning a rich response with status', () => {
    const h = defineMock<User>(() => ({
      status: 201,
      body: { id: 1, name: 'Ada' },
    }));
    expectTypeOf(h).toEqualTypeOf<ApitemkinHandler<User>>();
  });

  it('allows returning a rich response with custom headers', () => {
    const h = defineMock<{ ok: boolean }>(() => ({
      headers: { 'x-foo': 'bar' },
      body: { ok: true },
    }));
    expectTypeOf(h).toEqualTypeOf<ApitemkinHandler<{ ok: boolean }>>();
  });

  it('allows async handlers', () => {
    const h = defineMock<{ count: number }>(async () => ({ count: 1 }));
    expectTypeOf(h).toEqualTypeOf<ApitemkinHandler<{ count: number }>>();
  });

  it('infers TBody from the handler return when no generic is given', () => {
    const h = defineMock(() => ({ anything: 'goes' }));
    expectTypeOf(h).toEqualTypeOf<ApitemkinHandler<{ anything: string }>>();
  });
});

describe('exported types', () => {
  it('ApitemkinRequest has the documented shape', () => {
    expectTypeOf<ApitemkinRequest['method']>().toBeString();
    expectTypeOf<ApitemkinRequest['url']>().toBeString();
    expectTypeOf<ApitemkinRequest['params']>().toEqualTypeOf<
      Record<string, string>
    >();
    expectTypeOf<ApitemkinRequest['query']>().toEqualTypeOf<
      Record<string, string | string[]>
    >();
  });

  it('RichResponse wraps a generic body type', () => {
    expectTypeOf<RichResponse<User>['body']>().toEqualTypeOf<User>();
    expectTypeOf<RichResponse<User>['status']>().toEqualTypeOf<
      number | undefined
    >();
    expectTypeOf<RichResponse<User>['headers']>().toEqualTypeOf<
      Record<string, string> | undefined
    >();
  });

  it('ApitemkinHandler return type allows body, rich, or promise of either', () => {
    type R = ReturnType<ApitemkinHandler<User>>;
    expectTypeOf<R>().toEqualTypeOf<
      User | RichResponse<User> | Promise<User | RichResponse<User>>
    >();
  });
});
