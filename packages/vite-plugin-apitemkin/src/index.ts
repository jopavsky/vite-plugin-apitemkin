import type { Plugin } from 'vite';

export interface ApitemkinOptions {
  enabled?: boolean;
  apply?: 'dev' | 'build' | 'both';
}

export default function apitemkin(options: ApitemkinOptions = {}): Plugin {
  const { enabled = true, apply = 'dev' } = options;

  return {
    name: 'vite-plugin-apitemkin',
    apply: apply === 'both' ? undefined : apply === 'build' ? 'build' : 'serve',
    configResolved() {
      if (!enabled) return;
      // No-op for v0.0.2.
    },
  };
}

export { apitemkin };
