import { describe, it, expect, expectTypeOf } from 'vitest';
import {
  defineOverride,
  type DeepPartial,
} from '../src/index.js';

describe('defineOverride', () => {
  it('applies a shallow patch', () => {
    const base = { a: 1, b: 2 };
    expect(defineOverride(base, { b: 3 })).toEqual({ a: 1, b: 3 });
  });

  it('deep-merges nested object patches', () => {
    const base = { user: { id: 1, profile: { city: 'London', age: 30 } } };
    expect(defineOverride(base, { user: { profile: { city: 'Paris' } } }))
      .toEqual({ user: { id: 1, profile: { city: 'Paris', age: 30 } } });
  });

  it('adds keys that are not present in the base', () => {
    const base = { a: 1 } as { a: number; b?: number };
    expect(defineOverride(base, { b: 2 })).toEqual({ a: 1, b: 2 });
  });

  it('replaces arrays wholesale (does not concat)', () => {
    const base = { tags: ['x', 'y', 'z'] };
    expect(defineOverride(base, { tags: ['a'] })).toEqual({ tags: ['a'] });
  });

  it('null in patch sets the field to null (preserves the key)', () => {
    const base = { name: 'Ada' as string | null };
    expect(defineOverride(base, { name: null })).toEqual({ name: null });
  });

  it('undefined in patch preserves the base value', () => {
    const base = { a: 1, b: 2 };
    expect(defineOverride(base, { a: undefined })).toEqual({ a: 1, b: 2 });
  });

  it('empty patch returns a shallow clone of the base', () => {
    const base = { a: 1, b: 2 };
    const out = defineOverride(base, {});
    expect(out).toEqual(base);
    expect(out).not.toBe(base);
  });

  it('composes via nested calls', () => {
    const base = { id: 1, name: 'Ada', flags: { active: true, admin: false } };
    const step1 = defineOverride(base, { name: 'Grace' });
    const step2 = defineOverride(step1, { flags: { admin: true } });
    expect(step2).toEqual({
      id: 1,
      name: 'Grace',
      flags: { active: true, admin: true },
    });
  });

  it('does not mutate the base or the patch', () => {
    const base = { a: 1, nested: { b: 2 } };
    const patch = { nested: { b: 99 } };
    const baseSnapshot = JSON.parse(JSON.stringify(base));
    const patchSnapshot = JSON.parse(JSON.stringify(patch));
    defineOverride(base, patch);
    expect(base).toEqual(baseSnapshot);
    expect(patch).toEqual(patchSnapshot);
  });

  it('replaces class instances wholesale rather than merging properties', () => {
    class Box {
      constructor(public size: number) {}
    }
    const base = { box: new Box(1) };
    const replacement = new Box(99);
    const out = defineOverride(base, { box: replacement });
    expect(out.box).toBe(replacement);
    expect(out.box.size).toBe(99);
  });

  it('replaces Date objects wholesale rather than merging properties', () => {
    const base = { when: new Date('2026-01-01') };
    const newDate = new Date('2026-12-31');
    const out = defineOverride(base, { when: newDate });
    expect(out.when).toBe(newDate);
  });

  it('handles arrays at the root by replacing the entire value', () => {
    const base = [1, 2, 3];
    expect(defineOverride(base, [9])).toEqual([9]);
  });
});

describe('DeepPartial<T>', () => {
  it('allows partial nested objects', () => {
    type T = { a: { b: number; c: string } };
    expectTypeOf<{ a: { b: 1 } }>().toMatchTypeOf<DeepPartial<T>>();
    expectTypeOf<{ a: {} }>().toMatchTypeOf<DeepPartial<T>>();
    expectTypeOf<{}>().toMatchTypeOf<DeepPartial<T>>();
  });

  it('keeps arrays as the original element type (no element-level partial)', () => {
    type T = { tags: string[] };
    expectTypeOf<{ tags: string[] }>().toMatchTypeOf<DeepPartial<T>>();
  });

  it('preserves leaf primitive types', () => {
    type T = { count: number };
    expectTypeOf<DeepPartial<T>['count']>().toEqualTypeOf<number | undefined>();
  });
});

describe('defineOverride type inference', () => {
  it('returns the same type as the base argument', () => {
    interface User {
      id: number;
      name: string;
      profile: { city: string };
    }
    const base: User = { id: 1, name: 'Ada', profile: { city: 'London' } };
    const out = defineOverride(base, { profile: { city: 'Paris' } });
    expectTypeOf(out).toEqualTypeOf<User>();
  });
});
