import { describe, it, expect } from 'vitest';

describe('public exports', () => {
  it('runtime export list is unchanged', async () => {
    const mod = await import('../src/index.js');
    expect(Object.keys(mod).sort()).toEqual(
      ['apitemkin', 'default', 'defineMock', 'defineOverride', 'many', 'matchRoute', 'scanMocks']);
  });
});
