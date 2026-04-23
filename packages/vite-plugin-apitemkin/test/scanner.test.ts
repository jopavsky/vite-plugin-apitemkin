import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { scanMocks } from '../src/scanner.js';

let dir: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'apitemkin-scanner-'));
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

async function write(rel: string, content = '{}'): Promise<void> {
  const full = join(dir, rel);
  await mkdir(dirname(full), { recursive: true });
  await writeFile(full, content, 'utf8');
}

describe('scanMocks', () => {
  it('returns empty array for empty directory', async () => {
    expect(await scanMocks(dir)).toEqual([]);
  });

  it('returns empty array for non-existent directory', async () => {
    expect(await scanMocks(join(dir, 'does-not-exist'))).toEqual([]);
  });

  it('maps a top-level JSON file to a GET route under /api', async () => {
    await write('users.json');
    const routes = await scanMocks(dir);
    expect(routes).toHaveLength(1);
    expect(routes[0]).toMatchObject({
      method: 'GET',
      urlPattern: '/api/users',
    });
  });

  it('treats filename without method suffix as GET', async () => {
    await write('users.json');
    const [route] = await scanMocks(dir);
    expect(route!.method).toBe('GET');
  });

  it('parses an explicit GET suffix', async () => {
    await write('users.get.json');
    const [route] = await scanMocks(dir);
    expect(route!.method).toBe('GET');
    expect(route!.urlPattern).toBe('/api/users');
  });

  it.each([
    ['get', 'GET'],
    ['post', 'POST'],
    ['put', 'PUT'],
    ['patch', 'PATCH'],
    ['delete', 'DELETE'],
    ['head', 'HEAD'],
    ['options', 'OPTIONS'],
  ])('recognizes .%s.json suffix as %s', async (suffix, method) => {
    await write(`thing.${suffix}.json`);
    const [route] = await scanMocks(dir);
    expect(route!.method).toBe(method);
  });

  it('ignores non-JSON files and hidden files without .json', async () => {
    await write('users.json');
    await write('readme.txt', 'not json');
    await write('.DS_Store', 'mac noise');
    const routes = await scanMocks(dir);
    expect(routes).toHaveLength(1);
    expect(routes[0]!.urlPattern).toBe('/api/users');
  });

  it('recurses into subdirectories and parses [id] as a param', async () => {
    await write('users/[id].json');
    const [route] = await scanMocks(dir);
    expect(route!.urlPattern).toBe('/api/users/:id');
    expect(route!.method).toBe('GET');
    expect(route!.segments).toEqual([
      { kind: 'literal', value: 'users' },
      { kind: 'param', name: 'id' },
    ]);
  });

  it('handles deep nesting with multiple params', async () => {
    await write('[org]/users/[id]/posts.json');
    const [route] = await scanMocks(dir);
    expect(route!.urlPattern).toBe('/api/:org/users/:id/posts');
  });

  it('treats an unknown dot-suffix as part of the basename', async () => {
    await write('users.gte.json');
    const [route] = await scanMocks(dir);
    expect(route!.method).toBe('GET');
    expect(route!.urlPattern).toBe('/api/users.gte');
  });

  it('respects a custom URL prefix', async () => {
    await write('users.json');
    const [route] = await scanMocks(dir, '/v1');
    expect(route!.urlPattern).toBe('/v1/users');
  });

  it('supports an empty URL prefix', async () => {
    await write('users.json');
    const [route] = await scanMocks(dir, '');
    expect(route!.urlPattern).toBe('/users');
  });

  it('normalizes a trailing slash on the prefix', async () => {
    await write('users.json');
    const [route] = await scanMocks(dir, '/api/');
    expect(route!.urlPattern).toBe('/api/users');
  });

  it('normalizes a missing leading slash on the prefix', async () => {
    await write('users.json');
    const [route] = await scanMocks(dir, 'api');
    expect(route!.urlPattern).toBe('/api/users');
  });

  it('throws on conflict between unsuffixed and explicit-GET files', async () => {
    await write('users.json');
    await write('users.get.json');
    await expect(scanMocks(dir)).rejects.toThrow(
      /route conflict on GET \/api\/users/,
    );
  });

  it('does not conflict on different methods of the same URL', async () => {
    await write('users.get.json');
    await write('users.post.json');
    const routes = await scanMocks(dir);
    expect(routes).toHaveLength(2);
    const methods = routes.map((r) => r.method).sort();
    expect(methods).toEqual(['GET', 'POST']);
  });

  it('does not conflict between same path under different params', async () => {
    await write('users/[id].json');
    await write('orgs/[id].json');
    const routes = await scanMocks(dir);
    expect(routes).toHaveLength(2);
  });

  it('returns routes in deterministic order across runs', async () => {
    await write('zebra.json');
    await write('apple.json');
    await write('users/[id].json');
    const r1 = (await scanMocks(dir)).map((r) => r.urlPattern);
    const r2 = (await scanMocks(dir)).map((r) => r.urlPattern);
    expect(r1).toEqual(r2);
    expect(r1).toHaveLength(3);
  });

  it('preserves the absolute file path for each route', async () => {
    await write('users.json');
    const [route] = await scanMocks(dir);
    expect(route!.filePath).toBe(join(dir, 'users.json'));
  });

  describe('Option 1 — index resolution', () => {
    it('treats index.json inside a folder as the folder URL', async () => {
      await write('users/index.json');
      const [route] = await scanMocks(dir);
      expect(route!.urlPattern).toBe('/api/users');
      expect(route!.method).toBe('GET');
      expect(route!.segments).toEqual([{ kind: 'literal', value: 'users' }]);
    });

    it('parses method suffix on index files', async () => {
      await write('users/index.post.json');
      const [route] = await scanMocks(dir);
      expect(route!.urlPattern).toBe('/api/users');
      expect(route!.method).toBe('POST');
    });

    it('treats index.json at the mocks root as the prefix itself', async () => {
      await write('index.json');
      const [route] = await scanMocks(dir);
      expect(route!.urlPattern).toBe('/api');
      expect(route!.segments).toEqual([]);
    });

    it('handles index.json inside a [param] folder', async () => {
      await write('[org]/index.json');
      const [route] = await scanMocks(dir);
      expect(route!.urlPattern).toBe('/api/:org');
    });

    it('handles index.json deep inside [param] folders', async () => {
      await write('users/[id]/index.json');
      const [route] = await scanMocks(dir);
      expect(route!.urlPattern).toBe('/api/users/:id');
    });

    it('handles index method-suffixed file deep inside [param] folders', async () => {
      await write('users/[id]/index.delete.json');
      const [route] = await scanMocks(dir);
      expect(route!.urlPattern).toBe('/api/users/:id');
      expect(route!.method).toBe('DELETE');
    });

    it('coexists with sibling routes inside the same folder', async () => {
      await write('users/index.json');
      await write('users/[id].json');
      const routes = await scanMocks(dir);
      const patterns = routes.map((r) => r.urlPattern).sort();
      expect(patterns).toEqual(['/api/users', '/api/users/:id']);
    });
  });

  describe('Option 1 — ambiguity detection', () => {
    it('throws when a file and a folder share the same name', async () => {
      await write('users.json');
      await write('users/[id].json');
      await expect(scanMocks(dir)).rejects.toThrow(/ambiguous mock layout/);
    });

    it('error message names both paths and the migration command', async () => {
      await write('users.json');
      await write('users/[id].json');
      await expect(scanMocks(dir)).rejects.toThrow(
        /users\.json[\s\S]*users[\s\S]*mv[\s\S]*index\.json/,
      );
    });

    it('detects collision when the file uses a method suffix', async () => {
      await write('users.post.json');
      await write('users/[id].json');
      await expect(scanMocks(dir)).rejects.toThrow(
        /ambiguous[\s\S]*index\.post\.json/,
      );
    });

    it('detects collision at nested depth', async () => {
      await write('admin/users.json');
      await write('admin/users/[id].json');
      await expect(scanMocks(dir)).rejects.toThrow(/ambiguous/);
    });

    it('does not flag index.json sibling to a folder', async () => {
      await write('index.json');
      await write('users/[id].json');
      const routes = await scanMocks(dir);
      expect(routes).toHaveLength(2);
    });

    it('does not flag unrelated names', async () => {
      await write('users.json');
      await write('orgs/[id].json');
      const routes = await scanMocks(dir);
      expect(routes).toHaveLength(2);
    });

    it('allows a folder without an index file (URL prefix without own response)', async () => {
      await write('admin/users.json');
      const [route] = await scanMocks(dir);
      expect(route!.urlPattern).toBe('/api/admin/users');
    });
  });
});
