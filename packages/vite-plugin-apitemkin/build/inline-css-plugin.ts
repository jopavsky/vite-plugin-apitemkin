// Rolldown plugin: `import css from './x.css?inline'` becomes a minified
// string export. Used for the overlay bundle only.

import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import type { Plugin } from 'rolldown';
import { minifyCss } from './minify-css.ts';

const SUFFIX = '?inline';

export function inlineCssPlugin(): Plugin {
  return {
    name: 'apitemkin-inline-css',
    resolveId(source, importer) {
      if (!source.endsWith('.css' + SUFFIX)) return null;
      const file = source.slice(0, -SUFFIX.length);
      const abs = importer ? resolve(dirname(importer), file) : resolve(file);
      return abs + SUFFIX;
    },
    load(id) {
      if (!id.endsWith('.css' + SUFFIX)) return null;
      const css = minifyCss(readFileSync(id.slice(0, -SUFFIX.length), 'utf8'));
      return `export default ${JSON.stringify(css)};`;
    },
  };
}
