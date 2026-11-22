import { describe, it, expect, vi } from 'vitest';
import { createActivity, isUnexpectedError, isUnexpectedEntry } from '../src/devtools/activity.js';

describe('createActivity', () => {
  it('records status and duration; clears in-flight', () => {
    let t = 1000;
    const a = createActivity(() => t);
    const tok = a.start('GET /api/orders', null);
    expect(a.get('GET /api/orders')?.inFlightSince).toBe(1000);
    t = 1158;
    a.finish(tok, 500);
    expect(a.get('GET /api/orders')).toMatchObject({ status: 500, ms: 158, scenario: false });
  });

  it('records the URL-param scenario and clears it on the next plain request', () => {
    const a = createActivity(() => 0);
    a.finish(a.start('GET /api/orders', 'empty'), 200);
    expect(a.get('GET /api/orders')?.urlScenario).toBe('empty');
    a.finish(a.start('GET /api/orders', null), 200);
    expect(a.get('GET /api/orders')?.urlScenario).toBeUndefined();
  });

  it('notifies subscribers on start and finish, and stops after unsubscribe', () => {
    const a = createActivity(() => 0);
    const fn = vi.fn();
    const off = a.subscribe(fn);
    a.finish(a.start('GET /api/x', null), 200);
    expect(fn).toHaveBeenCalledTimes(2);
    off();
    a.start('GET /api/x', null);
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('ignores an unknown token', () => {
    const a = createActivity(() => 0);
    expect(() => a.finish(999, 200)).not.toThrow();
  });
});

describe('scenario at request time', () => {
  it('a 5xx that carried a panel scenario stays expected after the override is reset', () => {
    const a = createActivity(() => 0);
    a.finish(a.start('GET /api/orders', null, true), 500);
    expect(isUnexpectedError(a.get('GET /api/orders'))).toBe(false);
    a.finish(a.start('GET /api/orders', null, false), 500);
    expect(isUnexpectedError(a.get('GET /api/orders'))).toBe(true);
  });
});

describe('isUnexpectedError', () => {
  it('unexpected = 5xx on a route at default without a URL param', () => {
    expect(isUnexpectedError({ status: 500 })).toBe(true);
    expect(isUnexpectedError({ status: 500, scenario: true })).toBe(false);
    expect(isUnexpectedError({ status: 500, urlScenario: 'error' })).toBe(false);
    expect(isUnexpectedError({ status: 404 })).toBe(false);
    expect(isUnexpectedError(undefined)).toBe(false);
  });
});

describe('clock', () => {
  it('exposes the clock it measures with', () => {
    let t = 42;
    const a = createActivity(() => t);
    expect(a.now()).toBe(42);
    t = 50;
    expect(a.now()).toBe(50);
  });
});

describe('request log', () => {
  it('logs each request newest first with the scenario that answered, its result and whether the page chose it', () => {
    let t = 0;
    const a = createActivity(() => t);
    const k = 'GET /api/orders';
    let tok = a.start(k, null, true, true, 'error'); t += 324; a.finish(tok, 500);
    tok = a.start(k, 'empty', false, true, 'empty'); t += 140; a.finish(tok, 200);
    expect(a.get(k)?.log).toEqual([
      expect.objectContaining({ name: 'empty', served: 'empty', page: true, known: true, carried: true, status: 200, ms: 140 }),
      expect.objectContaining({ name: 'error', served: 'error', page: false, known: true, carried: true, status: 500, ms: 324 }),
    ]);
  });

  it('an in-flight request is logged at once, without a result', () => {
    const a = createActivity(() => 5);
    a.start('GET /x', null);
    expect(a.get('GET /x')?.log?.[0]).toMatchObject({ name: 'default', started: 5 });
    expect(a.get('GET /x')?.log?.[0]?.status).toBeUndefined();
  });

  it('keeps the last 10 requests', () => {
    const a = createActivity(() => 0);
    for (let i = 0; i < 12; i++) a.finish(a.start('GET /x', null), 200 + i);
    const log = a.get('GET /x')!.log!;
    expect(log).toHaveLength(10);
    expect(log[0]!.status).toBe(211);
    expect(log[9]!.status).toBe(202);
  });

  it('concurrent requests finish into their own entries', () => {
    let t = 0;
    const a = createActivity(() => t);
    const one = a.start('GET /x', 'one');
    const two = a.start('GET /x', 'two');
    t = 50; a.finish(two, 200);
    t = 90; a.finish(one, 500);
    const byName = Object.fromEntries((a.get('GET /x')?.log ?? []).map((e) => [e.name, e]));
    expect(byName['one']).toMatchObject({ status: 500, ms: 90 });
    expect(byName['two']).toMatchObject({ status: 200, ms: 50 });
  });

  it('an unknown page-asked name is logged with the name asked and default served', () => {
    const a = createActivity(() => 0);
    a.finish(a.start('GET /x', 'eu-vatt', false, false, 'default'), 200);
    expect(a.get('GET /x')?.log?.[0]).toMatchObject({ name: 'eu-vatt', served: 'default', known: false, page: true });
  });

  it('isUnexpectedEntry: a 5xx that carried no scenario', () => {
    expect(isUnexpectedEntry({ status: 500, carried: false })).toBe(true);
    expect(isUnexpectedEntry({ status: 500, carried: true })).toBe(false);
    expect(isUnexpectedEntry({ status: 200, carried: false })).toBe(false);
    expect(isUnexpectedEntry({ carried: false })).toBe(false);
  });
});

describe('overlapping requests', () => {
  it('a route stays in flight while another request to it is still pending', () => {
    let t = 0;
    const a = createActivity(() => t);
    a.start('GET /x', null);
    t = 100;
    const b = a.start('GET /x', null);
    t = 200;
    a.finish(b, 200);
    expect(a.get('GET /x')?.inFlightSince).toBe(0);
  });
});

