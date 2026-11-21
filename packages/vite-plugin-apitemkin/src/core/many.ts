/**
 * Build a list of `count` records. `make` receives the 0-based index.
 */
export function many<T>(count: number, make: (index: number) => T): T[] {
  if (!Number.isInteger(count) || count < 0) {
    throw new RangeError(`apitemkin: many() count must be a non-negative integer, got ${count}`);
  }
  return Array.from({ length: count }, (_, i) => make(i));
}
