import { describe, it, expect } from 'vitest';
import { many } from '../src/index.js';

describe('many', () => {
  it('calls make with 0-based indexes, in order', () => {
    expect(many(3, (i) => ({ id: i + 1 }))).toEqual([{ id: 1 }, { id: 2 }, { id: 3 }]);
  });
  it('returns [] for 0', () => {
    expect(many(0, () => 1)).toEqual([]);
  });
  it.each([-1, 1.5, NaN, Infinity])('throws RangeError for %s', (n) => {
    expect(() => many(n, () => 1)).toThrow(RangeError);
    expect(() => many(n, () => 1)).toThrow(/^apitemkin: many\(\) count must be a non-negative integer/);
  });
  it('infers the element type', () => {
    const xs: { id: number }[] = many(2, (i) => ({ id: i }));
    expect(xs).toHaveLength(2);
  });
});
