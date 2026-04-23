import { readdir } from 'node:fs/promises';
import { join, relative, sep } from 'node:path';

export type HttpMethod =
  | 'GET'
  | 'POST'
  | 'PUT'
  | 'PATCH'
  | 'DELETE'
  | 'HEAD'
  | 'OPTIONS';

export type PathSegment =
  | { kind: 'literal'; value: string }
  | { kind: 'param'; name: string };

export type MockRouteKind = 'json' | 'code';

export interface MockRoute {
  method: HttpMethod;
  urlPattern: string;
  segments: PathSegment[];
  filePath: string;
  kind: MockRouteKind;
}

const KNOWN_METHODS: ReadonlySet<string> = new Set([
  'get',
  'post',
  'put',
  'patch',
  'delete',
  'head',
  'options',
]);

const KNOWN_EXTENSIONS = ['.json', '.ts', '.js', '.mjs'] as const;
type KnownExtension = (typeof KNOWN_EXTENSIONS)[number];

function findExtension(filename: string): KnownExtension | undefined {
  for (const ext of KNOWN_EXTENSIONS) {
    if (filename.endsWith(ext)) return ext;
  }
  return undefined;
}

function kindForExtension(ext: KnownExtension): MockRouteKind {
  return ext === '.json' ? 'json' : 'code';
}

export async function scanMocks(
  rootDir: string,
  urlPrefix = '/api',
): Promise<MockRoute[]> {
  await detectAmbiguity(rootDir);

  const prefix = normalizePrefix(urlPrefix);
  const routes: MockRoute[] = [];
  const seen = new Map<string, string>();

  for await (const filePath of walkMocks(rootDir)) {
    const { method, urlPattern, segments, kind } = buildRoute(filePath, rootDir, prefix);
    const key = `${method} ${urlPattern}`;
    const existing = seen.get(key);
    if (existing) {
      const existingIsJson = existing.endsWith('.json');
      const newIsJson = filePath.endsWith('.json');
      const crossKindHint =
        existingIsJson !== newIsJson
          ? '\n  Pick one form per route: a JSON file OR a code file, not both.'
          : '';
      throw new Error(
        `apitemkin: route conflict on ${method} ${urlPattern}\n  - ${existing}\n  - ${filePath}${crossKindHint}`,
      );
    }
    seen.set(key, filePath);
    routes.push({ method, urlPattern, segments, filePath, kind });
  }

  routes.sort((a, b) => a.filePath.localeCompare(b.filePath));
  return routes;
}

async function detectAmbiguity(dir: string): Promise<void> {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return;
    throw err;
  }

  const folderNames = new Set<string>();
  const filesByBasename = new Map<string, string>();

  for (const entry of entries) {
    if (entry.isDirectory()) {
      folderNames.add(entry.name);
    } else if (entry.isFile()) {
      const ext = findExtension(entry.name);
      if (!ext) continue;
      const noExt = entry.name.slice(0, -ext.length);
      const { name } = parseFilename(noExt);
      if (name !== 'index') {
        filesByBasename.set(name, entry.name);
      }
    }
  }

  for (const [basename, fullName] of filesByBasename) {
    if (folderNames.has(basename)) {
      const filePath = join(dir, fullName);
      const folderPath = join(dir, basename);
      const indexName = 'index' + fullName.slice(basename.length);
      throw new Error(
        `apitemkin: ambiguous mock layout in ${dir}\n\n` +
          `  - ${filePath}\n` +
          `  - ${folderPath}${sep}\n\n` +
          `A file and a folder share the name "${basename}", so it's unclear which one\n` +
          `owns the same URL prefix. Move the file into the folder as an index file:\n\n` +
          `    mv "${filePath}" "${join(folderPath, indexName)}"\n`,
      );
    }
  }

  for (const entry of entries) {
    if (entry.isDirectory()) {
      await detectAmbiguity(join(dir, entry.name));
    }
  }
}

async function* walkMocks(dir: string): AsyncIterable<string> {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return;
    throw err;
  }
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      yield* walkMocks(full);
    } else if (entry.isFile() && findExtension(entry.name)) {
      yield full;
    }
  }
}

function buildRoute(
  filePath: string,
  rootDir: string,
  prefix: string,
): {
  method: HttpMethod;
  urlPattern: string;
  segments: PathSegment[];
  kind: MockRouteKind;
} {
  const rel = relative(rootDir, filePath);
  const parts = rel.split(sep);
  const filename = parts[parts.length - 1]!;
  const dirParts = parts.slice(0, -1);
  const ext = findExtension(filename)!;
  const basename = filename.slice(0, -ext.length);
  const kind = kindForExtension(ext);
  const { name, method } = parseFilename(basename);
  const allParts = name === 'index' ? dirParts : [...dirParts, name];
  const segments = allParts.map(parseSegment);
  const urlPattern = buildUrlPattern(prefix, segments);
  return { method, urlPattern, segments, kind };
}

function parseFilename(basename: string): { name: string; method: HttpMethod } {
  const lastDot = basename.lastIndexOf('.');
  if (lastDot === -1) return { name: basename, method: 'GET' };
  const suffix = basename.slice(lastDot + 1).toLowerCase();
  if (KNOWN_METHODS.has(suffix)) {
    return {
      name: basename.slice(0, lastDot),
      method: suffix.toUpperCase() as HttpMethod,
    };
  }
  return { name: basename, method: 'GET' };
}

function parseSegment(s: string): PathSegment {
  const m = /^\[([^\]]+)\]$/.exec(s);
  return m ? { kind: 'param', name: m[1]! } : { kind: 'literal', value: s };
}

function buildUrlPattern(prefix: string, segments: PathSegment[]): string {
  const segs = segments.map((s) =>
    s.kind === 'param' ? `:${s.name}` : s.value,
  );
  const path = segs.length === 0 ? '' : '/' + segs.join('/');
  return prefix + path;
}

function normalizePrefix(prefix: string): string {
  if (!prefix) return '';
  let p = prefix;
  if (!p.startsWith('/')) p = '/' + p;
  if (p.endsWith('/')) p = p.slice(0, -1);
  return p;
}
