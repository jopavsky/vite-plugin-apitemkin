import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

const pkgRoot = fileURLToPath(new URL('..', import.meta.url));
const repoRoot = resolve(pkgRoot, '..', '..');

const extractTsBlocks = (text: string) =>
  [...text.matchAll(/```ts\r?\n([\s\S]*?)```/g)]
    .map((m) => m[1]!)
    .filter((b) => !b.includes("from '@faker-js/faker'"));

const readGuide = () => readFile(join(pkgRoot, 'llms.txt'), 'utf8');

/** `mocks/todos/index.ts` from a first line `// mocks/todos/index.ts`, else null. */
const pathHeader = (block: string): string | null =>
  /^\/\/ (mocks\/[^\s]+\.ts)\r?$/m.exec(block.split('\n')[0] ?? '')?.[1] ?? null;

describe('llms.txt', () => {
  it('is listed in package.json files', async () => {
    const pkg = JSON.parse(await readFile(join(pkgRoot, 'package.json'), 'utf8'));
    expect(pkg.files).toContain('llms.txt');
  });

  it('covers the required topics', async () => {
    const text = await readGuide();
    for (const topic of [
      'defineMock',
      '?_scenario=',
      'defineOverride',
      'many(',
      'fallthrough',
      'defineCollection',
      '_data.ts',
      'Common mistakes',
    ]) {
      expect(text).toContain(topic);
    }
  });

  it('extracts the same ts blocks from CRLF content', async () => {
    const lf = (await readGuide()).replace(/\r\n/g, '\n');
    const crlf = lf.replace(/\n/g, '\r\n');
    expect(extractTsBlocks(lf).length).toBeGreaterThanOrEqual(4);
    expect(extractTsBlocks(crlf).length).toBe(extractTsBlocks(lf).length);
  });

  it('collection examples import their data file from a sibling block', async () => {
    const blocks = extractTsBlocks(await readGuide());
    const headers = blocks.map(pathHeader);
    expect(headers).toContain('mocks/todos/_data.ts');
    expect(blocks.some((b) => pathHeader(b) && b.includes("from './_data'"))).toBe(true);
  });

  it('every ts example typechecks against the real API', async () => {
    const text = await readGuide();
    const blocks = extractTsBlocks(text);
    expect(blocks.length).toBeGreaterThanOrEqual(4);

    const dir = await mkdtemp(join(tmpdir(), 'apitemkin-llms-'));
    try {
    // A block whose first line is `// mocks/....ts` is written at that path, so
    // collection examples can import `./_data` from a sibling block. A
    // path already taken goes to its own `dup<n>/` folder.
    const files: string[] = [];
    for (const [n, block] of blocks.entries()) {
      const header = pathHeader(block);
      let file = join(dir, `ex${n}.ts`);
      if (header) {
        file = join(dir, header);
        if (files.includes(file)) file = join(dir, `dup${n}`, header);
        await mkdir(dirname(file), { recursive: true });
      }
      await writeFile(file, block);
      files.push(file);
    }

    const program = ts.createProgram(files, {
      strict: true,
      noEmit: true,
      module: ts.ModuleKind.ESNext,
      moduleResolution: ts.ModuleResolutionKind.Bundler,
      target: ts.ScriptTarget.ES2022,
      skipLibCheck: true,
      types: ['node'],
      typeRoots: [join(repoRoot, 'node_modules', '@types')],
      baseUrl: pkgRoot,
      paths: { 'vite-plugin-apitemkin': ['src/index.ts'] },
    });
    const diagnostics = ts.getPreEmitDiagnostics(program);
    expect(ts.formatDiagnosticsWithColorAndContext(diagnostics, {
      getCurrentDirectory: () => pkgRoot,
      getCanonicalFileName: (f) => f,
      getNewLine: () => '\n',
    })).toBe('');
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
