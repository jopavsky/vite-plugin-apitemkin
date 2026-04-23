import type { Plugin } from 'vite';

export interface ApitemkinOptions {
  enabled?: boolean;
  mocksDir?: string;
  urlPrefix?: string;
}

export default function apitemkin(options: ApitemkinOptions = {}): Plugin {
  const { enabled = true } = options;

  return {
    name: 'vite-plugin-apitemkin',
    apply: 'serve',
    configResolved() {
      if (!enabled) return;
      // Folder scanner is wired in chunk C.
    },
  };
}

export { apitemkin };
export { scanMocks } from './scanner.js';
export type { HttpMethod, MockRoute, PathSegment } from './scanner.js';
export { matchRoute } from './matcher.js';
export type { MatchResult } from './matcher.js';
