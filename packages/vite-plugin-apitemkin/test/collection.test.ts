import { describe, it, expect } from 'vitest';
import {
  COLLECTION,
  defineCollection,
  internalsOf,
  isCollection,
} from '../src/core/collection.js';

const ada = () => ({ id: 1, name: 'Ada' });
const three = () => [
  { id: 1, name: 'A' },
  { id: 2, name: 'B' },
  { id: 3, name: 'C' },
];

describe('defineCollection: direct access', () => {
  it('all() returns the seed', () => {
    expect(defineCollection([ada()]).all()).toEqual([{ id: 1, name: 'Ada' }]);
  });

  it('seed objects are never mutated', () => {
    const seed = [ada()];
    const c = defineCollection(seed);
    c.patch(1, { name: 'Bob' });
    c.insert({ name: 'Cy' });
    expect(seed).toEqual([{ id: 1, name: 'Ada' }]);
  });

  it('reads return copies', () => {
    const c = defineCollection([ada()]);
    c.find(1)!.name = 'X';
    c.all()[0]!.name = 'X';
    expect(c.find(1)!.name).toBe('Ada');
  });

  it('insert stores a copy', () => {
    const c = defineCollection([ada()]);
    const input = { name: 'Bo' };
    const stored = c.insert(input);
    input.name = 'changed';
    stored.name = 'changed too';
    expect(c.find(stored.id)!.name).toBe('Bo');
  });

  it('find matches string ids against numeric ids', () => {
    expect(defineCollection([ada()]).find('1')).toEqual({ id: 1, name: 'Ada' });
  });

  it('numeric ids: insert assigns highest + 1', () => {
    expect(defineCollection(three()).insert({ name: 'D' }).id).toBe(4);
  });

  it('numeric ids are not reused after deleting the highest', () => {
    const c = defineCollection(three());
    expect(c.delete(3)).toBe(true);
    expect(c.insert({}).id).toBe(4);
  });

  it('empty seed starts at 1', () => {
    const c = defineCollection<{ id: number; name?: string }>([]);
    expect(c.insert({}).id).toBe(1);
  });

  it('string ids get a UUID', () => {
    const c = defineCollection([{ id: 'a' }]);
    expect(c.insert({}).id).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('insert throws on a duplicate id', () => {
    expect(() => defineCollection([ada()]).insert({ id: 1 })).toThrow(/already exists/);
  });

  it('patch merges shallowly and keeps the id', () => {
    const c = defineCollection([ada()]);
    expect(c.patch(1, { id: 99, name: 'B' })).toEqual({ id: 1, name: 'B' });
    expect(c.find(1)).toEqual({ id: 1, name: 'B' });
    expect(c.patch(7, { name: 'x' })).toBeUndefined();
  });

  it('delete returns false for an unknown id', () => {
    expect(defineCollection([ada()]).delete(9)).toBe(false);
  });

  it('idKey and newId options', () => {
    const c = defineCollection([{ uuid: 'x' }], { idKey: 'uuid', newId: () => 'n1' });
    expect(c.insert({}).uuid).toBe('n1');
    expect(c.find('x')).toEqual({ uuid: 'x' });
  });

  it('reset restores the seed and the id counter', () => {
    const c = defineCollection(three());
    c.insert({ name: 'D' });
    c.delete(1);
    internalsOf(c).reset();
    expect(c.all()).toEqual(three());
    expect(c.insert({}).id).toBe(4);
  });

  it('count() reflects the list', () => {
    const c = defineCollection(three());
    c.delete(2);
    expect(internalsOf(c).count()).toBe(2);
  });

  it('isCollection recognizes collections across package copies', () => {
    expect(isCollection(defineCollection([]))).toBe(true);
    const foreign = {};
    Object.defineProperty(foreign, Symbol.for('apitemkin.collection'), {
      value: { reset() {}, count: () => 0, name: undefined },
    });
    expect(isCollection(foreign)).toBe(true);
    expect(COLLECTION).toBe(Symbol.for('apitemkin.collection'));
    expect(isCollection({})).toBe(false);
    expect(isCollection(null)).toBe(false);
    expect(isCollection(5)).toBe(false);
  });

  it('a seed record without an id is a define-time error naming the fix', () => {
    expect(() => defineCollection([{ id: 1 }, { name: 'a' } as unknown as { id: number }])).toThrow(
      'apitemkin: defineCollection seed record 1 has no "id". Give every seed record an id, or set the idKey option.',
    );
    expect(() => defineCollection([{ name: 'a' }] as { uuid?: string; name: string }[], { idKey: 'uuid' })).toThrow(
      'seed record 0 has no "uuid"',
    );
  });

  it('duplicate seed ids are a define-time error', () => {
    expect(() => defineCollection([{ id: 1 }, { id: 2 }, { id: 1 }])).toThrow(
      'apitemkin: defineCollection seed has duplicate id 1 (records 0 and 2).',
    );
    expect(() => defineCollection([{ id: 1 }, { id: '1' }])).toThrow('duplicate id 1');
  });

  it('seeds that cannot be copied are a define-time error naming the fix', () => {
    expect(() => defineCollection([{ id: 1, run: () => 1 }])).toThrow(
      /apitemkin: defineCollection seed must be plain data/,
    );
  });

  it('an assigned id comes first in the stored record', () => {
    const c = defineCollection([{ id: 1, title: 'a' }]);
    expect(Object.keys(c.insert({ title: 'b' }))).toEqual(['id', 'title']);
    expect(Object.keys(c.find(2)!)).toEqual(['id', 'title']);
  });

  it('internals are not enumerable', () => {
    expect(Object.keys(defineCollection([]))).not.toContain(String(COLLECTION));
    expect(JSON.stringify(defineCollection([]))).toBe('{}');
  });
});
