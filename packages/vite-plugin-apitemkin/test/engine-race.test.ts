import { describe, it, expect, vi } from 'vitest';
import type { MockRoute } from '../src/core/scanner.js';

const pending: Array<(r: MockRoute[]) => void> = [];
vi.mock('../src/core/scanner.js', () => ({
  scanMocks: () => new Promise<MockRoute[]>((resolve) => pending.push(resolve)),
}));

const { createMockEngine } = await import('../src/core/engine.js');

const route = (urlPattern: string) => ({ urlPattern }) as unknown as MockRoute;

describe('engine rescan ordering', () => {
  it('an older, slower scan cannot overwrite a newer one', async () => {
    const engine = createMockEngine({
      mocksDir: '/x',
      urlPrefix: '/api',
      delay: 0,
      loadModule: async () => ({}),
    });
    const first = engine.rescan();
    const second = engine.rescan();
    pending[1]!([route('/api/new')]);
    await second;
    pending[0]!([route('/api/old')]);
    await first;
    expect(engine.routes().map((r) => r.urlPattern)).toEqual(['/api/new']);
  });
});
