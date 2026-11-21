import { describe, it, expect } from 'vitest';
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const coreDir = fileURLToPath(new URL('../src/core/', import.meta.url));
const VITE_IMPORT =
  /(\bfrom\s+|\bimport\s*\(\s*|\bimport\s+|\brequire\s*\(\s*)['"]vite(\/[^'"]*)?['"]|\/\/\/\s*<reference\s+types\s*=\s*['"]vite(\/[^'"]*)?['"]/;

async function listTsFiles(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const out: string[] = [];
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await listTsFiles(full)));
    else if (entry.isFile() && entry.name.endsWith('.ts')) out.push(full);
  }
  return out;
}

describe('src/core boundary', () => {
  it('detects every way of pulling in vite, but not vitest', () => {
    for (const bad of [
      "import { x } from 'vite';",
      'import type { X } from "vite/client";',
      "import 'vite';",
      "const v = require('vite');",
      "const v = await import('vite');",
      '/// <reference types="vite/client" />',
    ]) {
      expect(bad).toMatch(VITE_IMPORT);
    }
    for (const ok of [
      "import 'vitest';",
      "import { x } from 'vitest/config';",
      "import { a } from './vite-thing.js';",
    ]) {
      expect(ok).not.toMatch(VITE_IMPORT);
    }
  });

  it('no file under src/core imports vite', async () => {
    const files = await listTsFiles(coreDir);
    // scanner, matcher, runtime, define-mock, engine, many, scenario-param
    expect(files.length).toBeGreaterThanOrEqual(7);
    for (const file of files) {
      const content = await readFile(file, 'utf8');
      expect(content, file).not.toMatch(VITE_IMPORT);
    }
  });
});
