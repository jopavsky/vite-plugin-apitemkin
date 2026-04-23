import { describe, it, expect } from 'vitest';
import apitemkin, {
  apitemkin as namedApitemkin,
  type ApitemkinOptions,
} from '../src/index.js';

describe('apitemkin()', () => {
  it('returns a Vite plugin object with the expected name', () => {
    const plugin = apitemkin();
    expect(plugin).toBeTypeOf('object');
    expect(plugin.name).toBe('vite-plugin-apitemkin');
  });

  it('defaults to dev-only (apply: serve)', () => {
    expect(apitemkin().apply).toBe('serve');
  });

  it('honors apply: "build"', () => {
    expect(apitemkin({ apply: 'build' }).apply).toBe('build');
  });

  it('respects apply: "both" by leaving apply undefined', () => {
    expect(apitemkin({ apply: 'both' }).apply).toBeUndefined();
  });

  it('configResolved hook does not throw', () => {
    const plugin = apitemkin();
    const hook = plugin.configResolved;
    expect(() => (hook as any)?.({} as any)).not.toThrow();
  });

  it('exposes the same factory as default and named export', () => {
    expect(namedApitemkin).toBe(apitemkin);
  });

  it('accepts ApitemkinOptions type', () => {
    const opts: ApitemkinOptions = { enabled: false, apply: 'both' };
    expect(apitemkin(opts).name).toBe('vite-plugin-apitemkin');
  });
});
