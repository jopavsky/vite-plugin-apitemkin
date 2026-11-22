// @vitest-environment happy-dom
import { it, expect, vi } from 'vitest';

it('mounts the overlay even when the localStorage accessor itself throws', async () => {
  Object.defineProperty(window, 'localStorage', {
    configurable: true,
    get() {
      throw new DOMException('Access is denied', 'SecurityError');
    },
  });
  window.fetch = vi.fn(() => Promise.reject(new Error('offline'))) as unknown as typeof fetch;
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  await import('../src/devtools/client.js');
  expect(document.getElementById('apitemkin-devtools-host')).not.toBeNull();
});
