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

  it('is hardcoded dev-only (apply: serve)', () => {
    expect(apitemkin().apply).toBe('serve');
    expect(apitemkin({ enabled: false }).apply).toBe('serve');
  });

  it('configResolved hook does not throw on a valid Vite config shape', () => {
    const plugin = apitemkin();
    const hook = plugin.configResolved;
    expect(() => (hook as any)?.({ root: '/tmp/whatever' })).not.toThrow();
  });

  it('configResolved hook is a no-op when disabled', () => {
    const plugin = apitemkin({ enabled: false });
    const hook = plugin.configResolved;
    expect(() => (hook as any)?.({} as any)).not.toThrow();
  });

  it('exposes the same factory as default and named export', () => {
    expect(namedApitemkin).toBe(apitemkin);
  });

  it('accepts ApitemkinOptions type with all current fields', () => {
    const opts: ApitemkinOptions = {
      enabled: false,
      mocksDir: 'mocks',
      urlPrefix: '/api',
      delay: 100,
    };
    expect(apitemkin(opts).name).toBe('vite-plugin-apitemkin');
  });
});
